import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotesStore } from '../src/main/notes-store';

describe('NotesStore.duplicate', () => {
  let dir: string;
  let store: NotesStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'mn-store-'));
    store = new NotesStore(dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('copies to the next free numbered name', async () => {
    await writeFile(path.join(dir, 'Blue in Green.md'), '# Blue in Green\n\nhello');
    expect(await store.duplicate('Blue in Green.md')).toBe('Blue in Green 2.md');
    expect(await readFile(path.join(dir, 'Blue in Green 2.md'), 'utf8')).toBe('# Blue in Green\n\nhello');
    // Duplicating a duplicate keeps counting from the base name
    expect(await store.duplicate('Blue in Green 2.md')).toBe('Blue in Green 3.md');
  });
});
