import {
  For,
  Match,
  Suspense,
  Switch,
  createContext,
  createMemo,
  createSignal,
  useContext,
} from "solid-js";

import { Trans, useLingui } from "@lingui-solid/solid/macro";
import { VirtualContainer } from "@minht11/solid-virtual-container";
import { useQuery } from "@tanstack/solid-query";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import env from "@revolt/common/lib/env";
import {
  CircularProgress,
  TextField,
  typography,
} from "@revolt/ui/components/design";

import { CompositionMediaPickerContext } from "./CompositionMediaPicker";

type GifCategory = { title: string; image: string };

type GifResult = {
  url: string;
  media_formats: Record<"webm" | "tinywebm", { url: string }>;
};

const FilterContext = createContext<(value: string) => void>();

// STELLIS: on phones the 200×120 tiles only fit one per row inside the
// (now full-width) bottom-sheet picker, so each GIF looked huge and the
// list felt "fullscreen". Use smaller tiles so 3 fit per row and the
// picker is easy to browse. itemSize MUST match the rendered tile width
// or the virtual list mispositions items.
const COMPACT = typeof window !== "undefined" &&
  window.matchMedia("(max-width: 900px), (hover: none) and (pointer: coarse)").matches;
const TILE = COMPACT
  ? { height: 84, width: 112 }
  : { height: 120, width: 200 };

export function GifPicker() {
  const { t } = useLingui();
  const [filter, setFilter] = createSignal("");

  const fliterLowercase = () => filter().toLowerCase();

  return (
    <Stack data-stellis-gif-stack>
      <TextField
        autoFocus
        variant="filled"
        data-stellis-gif-search
        placeholder={t`Search for GIFs...`}
        value={filter()}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }}
        onChange={(e) => setFilter(e.currentTarget.value)}
      />
      <Suspense fallback={<CircularProgress />}>
        <Switch
          fallback={
            <FilterContext.Provider value={setFilter}>
              <Categories />
            </FilterContext.Provider>
          }
        >
          <Match when={fliterLowercase()}>
            <GifSearch query={fliterLowercase()} />
          </Match>
        </Switch>
      </Suspense>
    </Stack>
  );
}

const Stack = styled("div", {
  base: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
});

type CategoryItem =
  | {
      /**
       * Category entry
       */
      t: 0;
      category: GifCategory;
    }
  | {
      /**
       * Trending entry
       */
      t: 1;
      gif: GifResult | null;
    };

function Categories() {
  let targetElement!: HTMLDivElement;

  const client = useClient();

  const trendingCategories = useQuery<GifCategory[]>(() => ({
    queryKey: ["trendingGifCategories"],
    queryFn: () => {
      const [authHeader, authHeaderValue] = client()!.authenticationHeader;

      return fetch(`${env.DEFAULT_GIFBOX_URL}/categories?locale=en_US`, {
        headers: {
          [authHeader]: authHeaderValue,
        },
      }).then((r) => r.json());
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  }));

  const trendingGif = useQuery<GifResult | null>(() => ({
    queryKey: ["trendingGif1"],
    queryFn: () => {
      const [authHeader, authHeaderValue] = client()!.authenticationHeader;

      return fetch(`${env.DEFAULT_GIFBOX_URL}/trending?locale=en_US&limit=1`, {
        headers: {
          [authHeader]: authHeaderValue,
        },
      })
        .then((r) => r.json())
        .then((resp) => resp.results[0]);
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    initialData: null,
  }));

  const items = createMemo(() => {
    return [
      {
        t: 1,
        gif: trendingGif.data,
      },
      ...(trendingCategories.data?.map((category) => ({ t: 0, category })) ??
        []),
    ] as CategoryItem[];
  });

  // STELLIS: on phones the virtual list (absolute items + will-change)
  // refused to scroll under iOS touch. Render a plain native-scroll CSS
  // grid instead — iOS always scrolls a normal overflow container.
  if (COMPACT) {
    return (
      <div data-stellis-gif-scroll data-stellis-gif-grid>
        <For each={items()}>
          {(item) => <CategoryItem style={{}} tabIndex={0} item={item} />}
        </For>
      </div>
    );
  }

  return (
    <div ref={targetElement} data-stellis-gif-scroll use:invisibleScrollable>
      <VirtualContainer
        items={items()}
        scrollTarget={targetElement}
        itemSize={TILE}
        crossAxisCount={(measurements) =>
          Math.floor(measurements.container.cross / measurements.itemSize.cross)
        }
      >
        {CategoryItem}
      </VirtualContainer>
    </div>
  );
}

const CategoryItem = (props: {
  style: unknown;
  tabIndex: number;
  item: CategoryItem;
}) => {
  const setFilter = useContext(FilterContext);

  return (
    <Category
      style={{
        ...(props.style as object),
        width: `${TILE.width}px`,
        height: `${TILE.height}px`,
        "background-image": `linear-gradient(to right, #0006, #0006), url("${props.item.t === 0 ? props.item.category.image : props.item.gif?.url}")`,
      }}
      tabIndex={props.tabIndex}
      role="listitem"
      onClick={() =>
        setFilter!(props.item.t === 0 ? props.item.category.title : "trending")
      }
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }}
    >
      <Switch fallback={<Trans>Trending GIFs</Trans>}>
        <Match when={props.item.t === 0}>
          {(props.item as CategoryItem & { t: 0 }).category.title}
        </Match>
      </Switch>
    </Category>
  );
};

const Category = styled("div", {
  base: {
    ...typography.raw({ class: "title", size: "small" }),

    width: "200px",
    height: "120px",
    backgroundSize: "cover",
    backgroundPosition: "center",

    color: "white",
    display: "flex",
    padding: "var(--gap-md)",

    alignItems: "end",
    justifyContent: "end",

    cursor: "pointer",
  },
});

function GifSearch(props: { query: string }) {
  let targetElement!: HTMLDivElement;

  const client = useClient();

  const search = useQuery<GifResult[]>(() => ({
    queryKey: ["gifs", props.query],
    queryFn: () => {
      const [authHeader, authHeaderValue] = client()!.authenticationHeader;

      return fetch(
        `${env.DEFAULT_GIFBOX_URL}/` +
          (props.query === "trending"
            ? `trending?locale=en_US`
            : `search?locale=en_US&query=${encodeURIComponent(props.query)}`),
        {
          headers: {
            [authHeader]: authHeaderValue,
          },
        },
      )
        .then((r) => r.json())
        .then((resp) => resp.results);
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  }));

  if (COMPACT) {
    return (
      <div data-stellis-gif-scroll data-stellis-gif-grid>
        <For each={search.data as GifResult[] | undefined}>
          {(item) => <GifItem style={{}} tabIndex={0} item={item} />}
        </For>
      </div>
    );
  }

  return (
    <div ref={targetElement} data-stellis-gif-scroll use:invisibleScrollable>
      <VirtualContainer
        items={search.data as never /* resource */}
        scrollTarget={targetElement}
        itemSize={TILE}
        crossAxisCount={(measurements) =>
          Math.floor(measurements.container.cross / measurements.itemSize.cross)
        }
      >
        {GifItem}
      </VirtualContainer>
    </div>
  );
}

const GifItem = (props: {
  style: unknown;
  tabIndex: number;
  item: GifResult;
}) => {
  const { onMessage } = useContext(CompositionMediaPickerContext);

  return (
    <Gif
      loop
      autoplay
      muted
      // STELLIS: iOS force-fullscreens any <video> that autoplays unless
      // it's explicitly inline. Without these every GIF tile blew up to
      // fullscreen on the phone and you couldn't tap to pick one.
      attr:playsinline=""
      attr:webkit-playsinline=""
      preload="auto"
      role="listitem"
      style={{
        ...(props.style as object),
        width: `${TILE.width}px`,
        height: `${TILE.height}px`,
      }}
      tabIndex={props.tabIndex}
      src={props.item.media_formats.tinywebm.url}
      onClick={() => onMessage(props.item.url)}
    />
  );
};

const Gif = styled("video", {
  base: {
    width: "200px",
    height: "120px",
    cursor: "pointer",
    objectFit: "cover",
  },
});
