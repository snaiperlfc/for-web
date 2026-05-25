import {
  Accessor,
  batch,
  createContext,
  createSignal,
  JSX,
  Setter,
  useContext,
} from "solid-js";
import {
  RoomContext,
  TrackReferenceOrPlaceholder,
  useTracks,
} from "solid-livekit-components";

import {
  Room,
  ScreenSharePresets,
  Track,
  VideoResolution,
} from "livekit-client";
import { DenoiseTrackProcessor } from "livekit-rnnoise-processor";
import { Channel } from "stoat.js";

import { useClient } from "@revolt/client";
import { CONFIGURATION } from "@revolt/common";
import { ModalController, useModals } from "@revolt/modal";
import { useState } from "@revolt/state";
import {
  ScreenShareQualityName,
  Voice as VoiceSettings,
} from "@revolt/state/stores/Voice";
import { VoiceCallCardContext } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";

import { InRoom } from "./components/InRoom";
import { RoomAudioManager } from "./components/RoomAudioManager";

type State =
  | "READY"
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING";

type ScreenShareQuality = {
  name: ScreenShareQualityName;
  resolution: VideoResolution;
  fullName: string;
  contentHint: string;
};

class Voice {
  #settings: VoiceSettings;

  channel: Accessor<Channel | undefined>;
  #setChannel: Setter<Channel | undefined>;

  room: Accessor<Room | undefined>;
  #setRoom: Setter<Room | undefined>;

  vidTracks: Accessor<TrackReferenceOrPlaceholder[]>;

  state: Accessor<State>;
  #setState: Setter<State>;

  deafen: Accessor<boolean>;
  microphone: Accessor<boolean>;

  video: Accessor<boolean>;
  #setVideo: Setter<boolean>;

  screenshare: Accessor<boolean>;
  #setScreenshare: Setter<boolean>;

  fullscreen: Accessor<boolean>;
  #setFullscreen: Setter<boolean>;

  focusId: Accessor<string | undefined>;
  #setFocus: Setter<string | undefined>;

  showBar: Accessor<boolean>;
  #setShowBar: Setter<boolean>;

  private openModal;
  private getClient;

  constructor(voiceSettings: VoiceSettings, modals: ModalController) {
    this.#settings = voiceSettings;

    const [channel, setChannel] = createSignal<Channel>();
    this.channel = channel;
    this.#setChannel = setChannel;

    const [room, setRoom] = createSignal<Room>();
    this.room = room;
    this.#setRoom = setRoom;

    this.vidTracks = () => [];

    const [state, setState] = createSignal<State>("READY");
    this.state = state;
    this.#setState = setState;

    this.deafen = () => voiceSettings.deafen;
    this.microphone = () => voiceSettings.micOn;

    const [video, setVideo] = createSignal(false);
    this.video = video;
    this.#setVideo = setVideo;

    const [screenshare, setScreenshare] = createSignal(false);
    this.screenshare = screenshare;
    this.#setScreenshare = setScreenshare;

    const [fullscreen, setFullscreen] = createSignal(false);
    this.fullscreen = fullscreen;
    this.#setFullscreen = setFullscreen;

    const [focus, setFocus] = createSignal<string>();
    this.focusId = focus;
    this.#setFocus = setFocus;

    const [showBar, setShowBar] = createSignal(true);
    this.showBar = showBar;
    this.#setShowBar = setShowBar;

    this.openModal = modals.openModal;

    this.getClient = useClient();
  }

  async connect(channel: Channel, auth?: { url: string; token: string }) {
    this.disconnect();

    // STELLIS: request mic permission in the SAME user-gesture context as
    // the join click — Safari (16+) silently rejects getUserMedia after
    // any async hop. Without this, Safari sessions connected to LiveKit
    // fine (server saw "participant active") but never published a
    // microphone track — chat looked "connected but dead".
    //
    // Race against a 3s timeout so this never blocks the whole connect()
    // flow: in headless Chrome (no UI), in some Android browsers, and in
    // edge cases where the permission dialog never paints, getUserMedia
    // can hang forever. After 3s we just continue — LiveKit's own probe
    // will retry inside setMicrophoneEnabled and either succeed (if the
    // user granted permission late) or no-op (we'll log + flip micOn=false).
    if (this.speakingPermission && this.#settings.micOn) {
      try {
        const probe = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: this.#settings.preferredAudioInputDevice,
              echoCancellation: this.#settings.echoCancellation,
              noiseSuppression: this.#settings.noiseSupression === "browser",
              autoGainControl: this.#settings.autoGainControl,
            },
          }),
          new Promise<MediaStream>((_, reject) =>
            setTimeout(
              () =>
                reject(new DOMException("probe timed out", "TimeoutError")),
              3000,
            ),
          ),
        ]);
        probe.getTracks().forEach((t) => t.stop());
      } catch (e) {
        // Swallow common cases (denied / no device / timeout) — never block
        // connect(). Anything else still surfaces to the error modal.
        const name = (e as DOMException)?.name ?? "";
        const KNOWN = [
          "NotAllowedError",
          "NotFoundError",
          "OverconstrainedError",
          "TimeoutError",
          "AbortError",
        ];
        if (!KNOWN.includes(name)) this.onErr(e);
        console.warn("[voice] mic probe failed:", name, e);
      }
    }

    const room = new Room({
      audioCaptureDefaults: {
        deviceId: this.#settings.preferredAudioInputDevice,
        echoCancellation: this.#settings.echoCancellation,
        noiseSuppression: this.#settings.noiseSupression === "browser",
        autoGainControl: this.#settings.autoGainControl,
      },
      audioOutput: {
        deviceId: this.#settings.preferredAudioOutputDevice,
      },
    });

    // STELLIS: useTracks is tolerant of a transiently-undefined room now
    // (see solid-livekit-components fork commit ee0192d) — it returns an
    // empty track list during the gap and re-subscribes once `room` is
    // wired through context. Safe to call from this class method again
    // so the video grid (camera + screen share) renders.
    this.vidTracks = useTracks(
      [
        { source: Track.Source.Camera, withPlaceholder: true },
        { source: Track.Source.ScreenShare, withPlaceholder: false },
      ],
      { room, onlySubscribed: false },
    );

    batch(() => {
      this.#setRoom(room);
      this.#setChannel(channel);
      this.#setState("CONNECTING");
      this.#setVideo(false);
      this.#setScreenshare(false);
    });

    // STELLIS: factored post-connect work so we can call it from the event
    // listener AND defensively after `await room.connect()` — upstream
    // relied solely on the "connected" event, but in a race with ICE-pair
    // switching the listener occasionally never fires on the client side
    // even though LiveKit server marks the participant active. Symptom:
    // card stuck on "Подключение..." forever.
    const onConnected = () => {
      if (this.state() === "CONNECTED") return; // idempotent
      this.#setState("CONNECTED");
      if (this.speakingPermission)
        room.localParticipant
          .setMicrophoneEnabled(this.#settings.micOn)
          .then((track) => {
            this.#settings.micOn = track != null;
            if (this.#settings.noiseSupression === "enhanced") {
              track?.audioTrack?.setProcessor(
                new DenoiseTrackProcessor({
                  workletCDNURL: CONFIGURATION.RNNOISE_WORKLET_CDN_URL,
                }),
              );
            }
          })
          // STELLIS: previously this .then chain had no .catch, so any
          // mic-enable failure (permission denied, no device, Safari
          // user-gesture lost) was swallowed. Now we surface it.
          .catch((err) => {
            console.error("[voice] setMicrophoneEnabled failed:", err);
            this.#settings.micOn = false;
            if ((err as Error).name !== "NotAllowedError") this.onErr(err);
          });
    };

    room.on("connected", onConnected);
    room.on("reconnected", onConnected);
    room.on("reconnecting", () => this.#setState("RECONNECTING"));
    room.on("disconnected", () => this.#setState("DISCONNECTED"));

    if (!auth) {
      auth = await channel.joinCall("worldwide");
    }

    await room.connect(auth.url, auth.token, {
      autoSubscribe: false,
    });

    // Defensive fallback: room.connect() resolving means the room IS
    // connected. If the "connected" listener didn't fire (event/listener
    // race), still transition so the UI doesn't hang on CONNECTING.
    onConnected();
  }

  disconnect() {
    try {
      const room = this.room();
      if (!room) return;

      room.removeAllListeners();
      room.disconnect();

      batch(() => {
        this.#setState("READY");
        this.#setRoom();
        this.#setChannel();
        this.#setFullscreen(false);
        this.vidTracks = () => [];
      });
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleDeafen() {
    this.#settings.deafen = !this.#settings.deafen;
  }

  async toggleMute() {
    try {
      const room = this.room();
      if (!room) throw "invalid state";
      await room.localParticipant.setMicrophoneEnabled(
        !room.localParticipant.isMicrophoneEnabled,
      );

      this.#settings.micOn = room.localParticipant.isMicrophoneEnabled;
    } catch (e) {
      this.onErr(e);
    }
  }

  async toggleCamera() {
    try {
      const room = this.room();
      if (!room) throw "invalid state";

      // STELLIS: same user-gesture trick as the mic probe in connect().
      // iOS PWA + Safari reject getUserMedia after any await hop, so we
      // request camera permission synchronously here (this method runs
      // INSIDE the user-tap handler — see VoiceCallCardActions). Once
      // permission lands, LiveKit's setCameraEnabled below can succeed.
      // Only do the probe when turning the camera ON.
      const turningOn = !room.localParticipant.isCameraEnabled;
      if (turningOn) {
        try {
          const probe = await Promise.race([
            navigator.mediaDevices.getUserMedia({ video: true }),
            new Promise<MediaStream>((_, reject) =>
              setTimeout(
                () =>
                  reject(new DOMException("camera probe timed out", "TimeoutError")),
                3000,
              ),
            ),
          ]);
          probe.getTracks().forEach((t) => t.stop());
        } catch (e) {
          const name = (e as DOMException)?.name ?? "";
          // NotAllowedError on iOS means the user has either denied in the
          // permission dialog or never granted it via Settings → Stellis
          // → Camera. Surface it so they know what to fix.
          if (name === "NotAllowedError") {
            alert(
              "Камера запрещена. Включи доступ в Настройках:\n\niOS: Настройки → Stellis → Камера → Разрешить.\nMac Safari: Safari → Настройки → Веб-сайты → Камера → stellis.ru → Разрешить.",
            );
            return;
          }
          if (name === "NotFoundError") {
            alert("Камера не найдена на этом устройстве.");
            return;
          }
          if (!["TimeoutError", "AbortError"].includes(name)) {
            this.onErr(e);
            return;
          }
          // TimeoutError — keep going; LiveKit will retry inside setCameraEnabled
        }
      }

      await room.localParticipant.setCameraEnabled(turningOn);
      this.#setVideo(room.localParticipant.isCameraEnabled);
    } catch (e) {
      this.onErr(e);
    }
  }

  /**
   * Get the enabled screen share qualities. "low" will always be enabled.
   * Each screen share quality is checked against the limit if the limit is available on the client.
   *
   * TODO: Translate the fullNames here, I can't figure out how to do it.
   *
   * @param name The name of the screen share quality to get
   * @returns A partial record of ScreenShareQualityName to ScreenShareQuality. Will always contain "low" quality.
   */
  getEnabledScreenShareQualities(): Partial<
    Record<ScreenShareQualityName, ScreenShareQuality>
  > {
    // Always enable low
    const qualities: Partial<
      Record<ScreenShareQualityName, ScreenShareQuality>
    > = {
      low: {
        name: "low",
        resolution: ScreenSharePresets.h720fps30.resolution,
        fullName: `720p 30FPS`,
        contentHint: "motion",
      },
    };

    if (this.getClient().configured()) {
      // TODO: Use new user limits if the user is new - I don't think there's a way to do that now?
      const limit =
        this.getClient().configuration?.features.limits.default
          .video_resolution;

      // TODO: Add more resolutions to stream from if they're enabled. May tie into premium users in the future?
      if (limit) {
        if (
          (limit[0] === 0 || limit[0] >= 1920) &&
          (limit[1] === 0 || limit[1] >= 1080)
        ) {
          qualities.high = {
            name: "high",
            resolution: ScreenSharePresets.h1080fps30.resolution,
            fullName: `1080p 30FPS`,
            contentHint: "motion",
          };
          const originalResolution = ScreenSharePresets.original.resolution;
          originalResolution.frameRate = 5;
          originalResolution.aspectRatio = 0;
          if (this.getClient().configured()) {
            // TODO: Use new user limits if the user is new - I don't think there's a way to do that now?
            const limit =
              this.getClient().configuration?.features.limits.default
                .video_resolution;
            if (limit) {
              originalResolution.width = limit[0];
              originalResolution.height = limit[1];
              // If both resolutions are limited, set aspect ratio
              if (
                originalResolution.height !== 0 &&
                originalResolution.width !== 0
              ) {
                originalResolution.aspectRatio =
                  originalResolution.width / originalResolution.height;
              }
            }
          }
          qualities.text = {
            name: "text",
            resolution: originalResolution,
            fullName: `Source 5FPS`,
            contentHint: "text",
          };
        }
      }
    }
    return qualities;
  }

  async toggleScreenshare() {
    const room = this.room();
    if (!room) throw "invalid state";

    if (this.screenshare()) {
      await room.localParticipant.setScreenShareEnabled(false);

      this.#setScreenshare(room.localParticipant.isScreenShareEnabled);
    } else {
      // STELLIS: iOS Safari + iOS PWA do not implement getDisplayMedia at
      // all. Calling setScreenShareEnabled(true) below silently no-ops on
      // iOS, leaving the user clicking a dead button. Detect the missing
      // API up-front and tell the user — screen-sharing isn't possible
      // from iOS, period (Apple WebKit limitation, not our config).
      if (
        typeof navigator.mediaDevices?.getDisplayMedia !== "function"
      ) {
        alert(
          "Шаринг экрана с iPhone/iPad не поддерживается — это ограничение Apple Safari, не наше. Поделись через Mac/PC.",
        );
        return;
      }

      const qualities = this.getEnabledScreenShareQualities();
      let screenPickerQualityName: ScreenShareQualityName | undefined;

      // Register the modal on screen picker handler if it exists
      if (window.native && window.native.onceScreenPicker) {
        window.native.onceScreenPicker((sources) => {
          this.openModal({
            type: "screen_share_picker",
            onCancel: () => {
              window.native.screenPickerCallback(-1, false);
            },
            callback: (idx: number, qualityName: ScreenShareQualityName) => {
              // TODO: Change this to true when enabling screen share audio.
              window.native.screenPickerCallback(idx, false);
              screenPickerQualityName = qualityName;
            },
            sources: sources,
            qualities: Object.keys(qualities).map((k) => {
              const v = qualities[k as ScreenShareQualityName]!;
              return { name: k, fullName: v.fullName };
            }),
          });
        });
      }

      try {
        const localTrack = await room.localParticipant.setScreenShareEnabled(
          true,
          {
            resolution:
              this.getEnabledScreenShareQualities()[
                this.#settings.screenShareQuality || "low"
              ]?.resolution,
            // TODO: Change this to true when enabling screen share audio.
            audio: false,
          },
        );

        this.#setScreenshare(room.localParticipant.isScreenShareEnabled);

        if (localTrack) {
          const callback = async (qualityName: ScreenShareQualityName) => {
            const quality = qualities[qualityName] || qualities.low!;

            if (localTrack.videoTrack) {
              await localTrack.videoTrack.mediaStreamTrack.applyConstraints({
                frameRate: { max: quality.resolution.frameRate },
                width:
                  quality.resolution.width === 0
                    ? undefined
                    : { max: quality.resolution.width },
                height:
                  quality.resolution.width === 0
                    ? undefined
                    : { max: quality.resolution.height },
              });
              localTrack.videoTrack.mediaStreamTrack.contentHint =
                quality.contentHint;
            }
          };

          if (screenPickerQualityName) {
            callback(screenPickerQualityName || "low");
          } else if (this.#settings.screenShareQualityAsk) {
            if (Object.keys(qualities).length > 1) {
              localTrack.pauseUpstream();
              this.openModal({
                onCancel: async () => {
                  await room.localParticipant.setScreenShareEnabled(false);
                  this.#setScreenshare(
                    room.localParticipant.isScreenShareEnabled,
                  );
                },
                type: "screen_share_settings",
                trackReference: {
                  participant: room.localParticipant,
                  publication: localTrack,
                  source: Track.Source.ScreenShare,
                },
                qualities: Object.keys(qualities).map((k) => {
                  const v = qualities[k as ScreenShareQualityName]!;
                  return { name: k, fullName: v.fullName };
                }),
                callback: async (qualityName) => {
                  callback(qualityName);
                  localTrack.resumeUpstream();
                },
              });
            } else {
              callback(this.#settings.screenShareQuality || "low");
            }
          }
        }
      } catch (e) {
        this.onErr(e);
      }
    }
  }

  toggleFullscreen(fullscreen: boolean = !this.fullscreen()) {
    this.#setFullscreen(fullscreen);
  }

  trackId(t: TrackReferenceOrPlaceholder) {
    return `${t.source}_${t.participant.sid}`;
  }

  toggleFocus(t?: TrackReferenceOrPlaceholder) {
    const id = t ? this.trackId(t) : undefined;
    this.#setFocus(
      this.focusId() === id || this.vidTracks().length < 2 ? undefined : id,
    );
  }

  isFocus(t: TrackReferenceOrPlaceholder) {
    return this.trackId(t) === this.focusId();
  }

  focusTrack() {
    const id = this.focusId();
    return id
      ? this.vidTracks().find((t) => this.trackId(t) === id)
      : undefined;
  }

  toggleShowBar() {
    this.#setShowBar((s) => !s);
  }

  getConnectedUser(userId: string) {
    return this.room()?.getParticipantByIdentity(userId);
  }

  get listenPermission() {
    return !!this.channel()?.havePermission("Listen");
  }

  get speakingPermission() {
    return !!this.channel()?.havePermission("Speak");
  }

  private onErr(e: unknown) {
    if ((e as Error).name !== "NotAllowedError")
      this.openModal({ type: "error2", error: e });
  }
}

const voiceContext = createContext<Voice>(null as unknown as Voice);

/**
 * Mount global voice context and room audio manager
 */
export function VoiceContext(props: { children: JSX.Element }) {
  const state = useState();
  const modals = useModals();
  const voice = new Voice(state.voice, modals);

  return (
    <voiceContext.Provider value={voice}>
      <RoomContext.Provider value={voice.room}>
        <VoiceCallCardContext>{props.children}</VoiceCallCardContext>
        <InRoom>
          <RoomAudioManager />
        </InRoom>
      </RoomContext.Provider>
    </voiceContext.Provider>
  );
}

export const useVoice = () => useContext(voiceContext);
