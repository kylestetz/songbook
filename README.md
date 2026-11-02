# Music Notes

A quiet writing app for music. You can use it as a scratchpad for musical ideas or as a place to write and publish essays about songs, harmony and composition. Notes are plain markdown files, saved as you type. Musical **widgets** (notes, chords, scales, progressions, guitar and piano voicings, piano rolls and more) sit in the text and play when you click them.

## Getting started

```bash
npm install
```

```bash
npm run dev        # run the Electron app with hot reload
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Build the publishing runtime, then the Electron main, preload and renderer bundles into `out/` |
| `npm start` | Run the built app (`electron-vite preview`) |
| `npm run web` | Run the renderer in a plain browser, with notes stored in `localStorage`. Useful for UI work. |
| `npm run dist` | Package a macOS `.dmg`/`.zip` with electron-builder |
| `npm test` | Unit tests (theory, markdown round-trips, widgets) |
| `npm run typecheck` | TypeScript, no emit |

The first time you run the app, it creates `~/Documents/Music Notes/` and seeds it with a welcome note that shows every widget. Use **File → Open Notes Folder…** to point the app at a different folder.

## Using it

- **Markdown shortcuts render as you type.** Use `#`–`######` for headings, `-`/`*`/`1.` for lists, `>` for quotes, ```` ``` ```` for code blocks, `---` for a rule, and `**bold**`, `*italic*`, `` `code` ``, `~~strike~~` and `[text](url)` inline. Selecting text shows a small formatting bar.
- **Widgets.** Type `/` to open the widget menu, use the **+** button in the toolbar, or pick from **Insert** in the menu bar. Every widget is created and edited in a form (a modal for blocks, an inline popover for inline widgets), so you never need to remember the syntax. To edit a widget, double-click it, click the **Edit** button beside a block, or click an inline pill and choose **Edit**.
- **Play notes and chords in instead of typing them.** Widgets that hold notes or chords (note, notes, interval, chord symbol, piano, guitar, progression) have an input along the bottom of the editor with three tabs: **Piano**, **Guitar** and **Type**. Click keys or frets and you hear each note as you go. Chords are named for you from what you play (E–G–C becomes C/E). On the guitar tab you get one note per string, and the shape you play becomes the widget's fingering. In a progression, play a chord and press **Add**, or pick an existing chord to change it. Progressions keep the exact voicing you play, including which strings it's on, and the name is only a label you can change: `Am7[A2 E3 G3 C4 E4 @x02010]`. The app remembers the last tab you used, so if you think in guitar shapes, the fretboard is always there.
- **Document settings** (⌘,) set the sound (piano, electric piano, nylon guitar, organ, synth, marimba or pure tone), the tempo and the volume used by every widget in the note. They also hold title, author and description metadata for publishing.
- **Images.** Paste or drop images into a note. They're copied to `assets/` next to your notes and referenced with a relative path.
- **Export as HTML** (⇧⌘E) writes one self-contained `.html` file: styles, the widget runtime and images are all inlined, and the widgets stay fully interactive.

## Markdown format

Notes are CommonMark plus strikethrough, with YAML front matter for document settings and [generic directives](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444) for widgets. Files read naturally in any editor.

```markdown
---
title: Notes on "Blue in Green"
sound: epiano
tempo: 72
---

# Blue in Green

The opening :chord[Bbmaj7#11] floats; the :interval[A4 D5] in the melody...

::progression[Bbmaj7#11 A7#9 Dm9 Db7 Cm9 F7 Bbmaj7]{key=Dm beats=2}

::guitar[Am7]{frets=x02010}
```

- **Inline widgets** look like `:name[content]{attrs}`.
- **Block widgets** sit on their own line and look like `::name[content]{attrs}`.
- Attribute values that contain spaces are quoted: `{notes="C4@0+2 E4@2"}`. A bare attribute such as `{chord}` means `true`.
- Attributes left at their default are omitted when the app writes the file. Attributes the app doesn't recognize are preserved, and unknown widgets render as a placeholder without losing data.

### Widgets

| Widget | Kind | Example | Notes |
| --- | --- | --- | --- |
| Note | inline | `:note[C#4]` | |
| Notes | inline | `:notes[C E G B]`, `:notes[D F A C]{chord}` | Plays in sequence, or together with `chord` |
| Chord symbol | inline | `:chord[Cmaj7]`, `:chord[Am/G]` | Hover shows the chord tones |
| Interval | inline | `:interval[C4 G4]{play=harmonic}` | Shows the interval name, e.g. P5 |
| Scale or mode | block | `::scale{root=D mode=dorian octave=4 chords=sevenths}` | Keyboard and optional diatonic chords. `labels=degrees\|notes\|none`, `direction=up\|updown\|down` |
| Chord progression | block | `::progression[ii7 V7 Imaj7]{key=C beats=2 style=arpeggio}` | Chord symbols or roman numerals. `style=block\|strum\|arpeggio\|pulse`, `loop` |
| Guitar chord | block | `::guitar[Am7]`, `::guitar[F]{frets=133211}` | Automatic voicings, or custom `frets`. `tuning=standard\|drop-d\|dadgad\|open-g\|open-d\|half-step-down` |
| Piano chord | block | `::piano[Fmaj7/A]{labels=intervals}` | A chord symbol or a list of notes |
| Piano roll | block | `::pianoroll{notes="C4@0+2 E4@2" steps=16 grid=4}` | `pitch@step+length`. Edit it on a grid in the widget form. |
| Circle of fifths | block | `::circle{key=Em}` | Highlights the key and its closest chords |

Every widget also accepts `sound=…` to override the document's instrument, and block widgets accept `caption="…"`.

## Architecture

The codebase is split so that a note can be published as a standalone web page. The Electron app is one host for the writing environment, and the published HTML page is another.

```
src/
  core/                 Framework-free, shared by the app and published pages
    theory/             Notes, chords, scales, roman numerals, guitar voicings (on top of tonal)
    audio/              Web Audio engine + synthesized instruments (no sample files)
    markdown/           markdown-it setup, the directive syntax, front matter
    widgets/            The widget registry. Each widget = fields + defaults + render()
    publish/            Markdown → self-contained HTML (+ syntax highlighting)
    runtime/            Entry point inlined into published pages; hydrates widgets
    styles/             Design tokens, themes, document typography, widget styles
    themes.ts           Theme registry and the list of tokens every theme must define
  editor/               ProseMirror editor: schema, markdown parser/serializer,
                        input rules, keymap, node views, slash menu
  renderer/             React app shell: sidebar, editor pane, widget forms, settings
  main/                 Electron main process: notes folder, IPC, menus, asset protocol
  preload/              The `window.musicNotes` bridge (typed in src/shared/api.ts)
```

How the parts fit together:

- **One markdown dialect.** `core/markdown` defines the parser (CommonMark, strikethrough and directives). The editor builds its ProseMirror document from it, and the publisher renders HTML from it, so the editor and published pages always agree.
- **WYSIWYG on ProseMirror.** The editor's schema mirrors that markdown dialect, and `prosemirror-markdown` converts between the two. Widgets are atom nodes, and their node views call the same `render()` functions that published pages use. Round-trip stability (markdown → editor → markdown) is covered by tests.
- **Widgets are data-driven.** A `WidgetDefinition` (in `core/widgets/types.ts`) declares its directive name, its fields (which drive the insert/edit forms), its defaults, a `render(el, values, ctx)` function written in plain DOM/SVG, and a text `summary()`. To add a widget, write one definition and add it to `WIDGETS` in `core/widgets/index.ts`. The menu, forms, editor, serializer and publisher all pick it up from there. (Electron's menu reads a lightweight copy in `registry-meta.ts`, and a test keeps the two in sync.)
- **Publishing.** `vite.runtime.config.mts` builds `core/runtime` into a single IIFE plus a stylesheet (about 27 KB gzipped). `core/publish` renders the note with widget placeholders that carry their values as JSON, then inlines the runtime, the styles and any images into a single HTML file.
- **Theming.** Every color, typeface, radius and shadow comes from a CSS custom property. `core/styles/tokens.css` holds font stacks and *derived* tokens (accent tints, hover washes, shadows, key marks), computed from a small set of theme tokens. Each theme in `core/styles/themes/` sets those tokens once, light and dark together with `light-dark()`, scoped to `[data-theme='…']`. `data-color-scheme="light|dark"` pins the scheme; without it the OS decides. Both attributes work on any element, which is how the theme picker previews each theme. Components read semantic tokens only; a test fails on raw colors in component CSS or on a theme missing any token in `THEME_TOKENS`. To add a theme, add a stylesheet, import it in `theme.css` and register it in `core/themes.ts`. The chosen theme is an app preference (in `localStorage`) and is written into HTML exports.
- **Storage.** Notes are `.md` files in a folder. A file is renamed to match its title (front-matter `title`, or else the first heading), and the folder is watched for outside edits. The renderer only talks to storage through `MusicNotesApi`. In the browser (`npm run web`) a `localStorage` implementation stands in for it.

## Roadmap ideas

- More widgets: rhythm/drum grid, guitar tab, chord-scale relationships, voice-leading view, metronome, ear-training quizzes.
- GFM tables and task lists, footnotes.
- Sampled instruments (loaded on demand) alongside the synthesized ones.
- Publishing targets beyond a single file: a folder/site export, or publishing to a URL.
- Note search across content, folders/tags, focus mode, typewriter scrolling.
