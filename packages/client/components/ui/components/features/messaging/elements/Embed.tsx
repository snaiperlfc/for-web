import { Match, Switch } from "solid-js";

import {
  ImageEmbed,
  MessageEmbed,
  TextEmbed as TextEmbedClass,
  VideoEmbed,
  WebsiteEmbed,
} from "stoat.js";
import { css } from "styled-system/css";

import { useModals } from "@revolt/modal";
import { SizedContent } from "@revolt/ui/components/utils";

import { TextEmbed } from "./TextEmbed";

/**
 * Render a given embed
 */
export function Embed(props: { embed: MessageEmbed }) {
  const { openModal } = useModals();

  /**
   * Whether the embed is a GIF
   */
  const isGIF = () =>
    props.embed.type === "Website" &&
    ((props.embed as WebsiteEmbed).specialContent?.type === "GIF" ||
      (props.embed as WebsiteEmbed).originalUrl?.startsWith(
        "https://tenor.com",
      ));

  /**
   * Whether there is a video
   */
  const video = () =>
    (props.embed.type === "Video"
      ? (props.embed as VideoEmbed)
      : isGIF() && (props.embed as WebsiteEmbed).video) || undefined;

  /**
   * Whether there is a image
   */
  const image = () =>
    (props.embed.type === "Image"
      ? (props.embed as ImageEmbed)
      : isGIF() && (props.embed as WebsiteEmbed).image) || undefined;

  /**
   * STELLIS: Giphy direct-media fallback.
   *
   * january (the embed scraper) on the RU VPS can't reach giphy.com — it's
   * geo-blocked by RKN. So for a Giphy URL it creates a `Special: GIF`
   * embed carrying the id but WITHOUT populating `.image` / `.video` media
   * (those need an HTTP fetch it can't make). The default render path then
   * falls through to SpecialEmbed → <iframe src={embedURL}>, but embedURL's
   * getter has no GIF case → src is undefined → an empty box.
   *
   * `media.giphy.com` IS reachable from RU, so synthesize the mp4 straight
   * from the Giphy id parsed out of the embed's url/originalUrl. Only fires
   * when there's no real media already (so Tenor and properly-scraped GIFs
   * keep their normal path).
   */
  const giphyFallback = () => {
    if (props.embed.type !== "Website") return undefined;
    const e = props.embed as WebsiteEmbed;
    if (e.specialContent?.type !== "GIF") return undefined;
    if (e.image?.url || e.video?.url) return undefined;
    const src = e.url ?? e.originalUrl ?? "";
    // /gifs/<slug>-<id>, /gifs/<id>, /embed/<id>, /media/<id>
    const m = src.match(
      /giphy\.com\/(?:gifs\/(?:[\w-]+-)?|embed\/|media\/)([a-zA-Z0-9]{6,})/,
    );
    if (!m) return undefined;
    return `https://media.giphy.com/media/${m[1]}/giphy.mp4`;
  };

  return (
    <Switch fallback={`Could not render ${props.embed.type}!`}>
      <Match when={giphyFallback()}>
        <div class={css({ maxWidth: "min(100%, 360px)" })}>
          <video
            src={giphyFallback()}
            autoplay
            loop
            muted
            playsinline
            preload="metadata"
            class={css({
              maxWidth: "100%",
              maxHeight: "320px",
              borderRadius: "6px",
              display: "block",
            })}
          />
        </div>
      </Match>
      <Match when={image()}>
        <SizedContent width={image()!.width} height={image()!.height}>
          <img
            // bypass proxy for known GIF providers
            src={isGIF() ? image()!.url : image()!.proxiedURL}
            loading="lazy"
            class={css({ cursor: "pointer" })}
            onClick={() =>
              openModal({
                type: "image_viewer",
                embed: image(),
              })
            }
          />
        </SizedContent>
      </Match>
      <Match when={video()}>
        <SizedContent width={video()!.width} height={video()!.height}>
          <video
            loop={isGIF()}
            muted={isGIF()}
            autoplay={isGIF()}
            controls={!isGIF()}
            // STELLIS: keep autoplaying GIF embeds inline on iOS (otherwise
            // they force-fullscreen on play).
            attr:playsinline=""
            attr:webkit-playsinline=""
            preload="metadata"
            // bypass proxy for known GIF providers
            src={isGIF() ? video()!.url : video()!.proxiedURL}
            class={css({ cursor: isGIF() ? "pointer" : "unset" })}
            onClick={() =>
              isGIF() &&
              openModal({
                type: "image_viewer",
                gif: video(),
              })
            }
          />
        </SizedContent>
      </Match>
      <Match
        when={props.embed.type === "Website" || props.embed.type === "Text"}
      >
        <TextEmbed embed={props.embed as WebsiteEmbed | TextEmbedClass} />
      </Match>
      <Match when={props.embed.type === "None"}> </Match>
    </Switch>
  );
}
