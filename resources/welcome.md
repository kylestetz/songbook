---
title: Welcome to Music Notes
sound: piano
tempo: 92
---

# Welcome to Music Notes

Music Notes is a quiet place to write about music: sketch ideas, take notes on songs you're learning, or publish an essay about harmony. Everything you write is plain markdown, saved as you type.

The musical bits are **widgets**. Click any of them to hear it. To add one, type `/` on an empty line, or use the **+** button in the toolbar.

## Inline widgets

Widgets can sit right inside a sentence. The note :note[A4] is concert pitch. A :chord[Cmaj7] has a soft, open quality, while :chord[G7] wants to resolve. Spell out a shape like :notes[C E G B] or play it all at once as :notes[D F A C]{chord}. The distance :interval[C4 G4] is the backbone of most chords.

## Scales and modes

Scales sit inline too. :scale{root=D mode=dorian} is a minor mode with a bright sixth, compared to the darker :scale{root=D mode=minor}. Spell a scale out by note name instead, like :scale{root=G mode=mixolydian labels=notes}.

## Progressions

Write chord symbols or roman numerals. With a key set, each chord shows its function.

::progression[ii7 V7 Imaj7 vi7]{key=C beats=4 style=arpeggio}

## Guitar and piano

::guitar[Am7]

::piano[Fmaj7/A]{labels=intervals}

## Melodies

::pianoroll{notes="E4@0+2 G4@2+2 A4@4+3 G4@7 E4@8+2 D4@10+2 C4@12+4" steps=16}

## Keys

::circle{key=G}

## Plain old markdown

All the usual things work: *emphasis*, **bold**, `inline code`, [links](https://en.wikipedia.org/wiki/Circle_of_fifths), lists, quotes and code blocks.

> Music is the space between the notes. — attributed to Claude Debussy

```js
// Equal temperament: each semitone is the 12th root of 2
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
```

Open **Document settings** (⌘,) to change the sound and tempo for every widget in this note, and use **File → Export as HTML** to publish it as a single web page.
