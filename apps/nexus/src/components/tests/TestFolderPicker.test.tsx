import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import TestFolderPicker from './TestFolderPicker';

/**
 * The picker replaced a typed "Foundation / History of Architecture" path, so
 * the properties worth holding are the ones typing could not give: it hands back
 * a real folder id, it hands back the full path with it, and a folder created
 * here lands inside the folder that was selected rather than at the top.
 */

interface StubFolder {
  id: string;
  name: string;
  parent_id: string | null;
  test_count: number;
  children: StubFolder[];
}

/** Stands in for the page's authFetch, and keeps the tree it serves. */
function stubAuthFetch() {
  const tree: StubFolder[] = [
    {
      id: 'foundation',
      name: 'Foundation',
      parent_id: null,
      test_count: 2,
      children: [
        {
          id: 'history',
          name: 'History of Architecture',
          parent_id: 'foundation',
          test_count: 1,
          children: [],
        },
      ],
    },
    { id: 'mock', name: 'Mock Tests', parent_id: null, test_count: 4, children: [] },
  ];

  const find = (nodes: StubFolder[], id: string): StubFolder | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = find(n.children, id);
      if (hit) return hit;
    }
    return null;
  };

  const authFetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/test-folders' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const created: StubFolder = {
        id: 'created-id',
        name: body.name,
        parent_id: body.parent_id ?? null,
        test_count: 0,
        children: [],
      };
      const parent = body.parent_id ? find(tree, body.parent_id) : null;
      if (parent) parent.children.push(created);
      else tree.push(created);
      return { data: created };
    }
    // Copied, the way a real response is. Handing back the same array twice
    // would make React skip the re-render and hide a refresh that did happen.
    return { data: { tree: JSON.parse(JSON.stringify(tree)), unfiled_count: 3 } };
  });

  return authFetch;
}

/** Open the dialog and wait for the tree to be on screen. */
async function openPicker(label = 'Folder') {
  fireEvent.click(screen.getByLabelText(label));
  await screen.findByText('Foundation');
}

describe('TestFolderPicker', () => {
  it('reads Unfiled until a folder is picked, never a blank box', async () => {
    const authFetch = stubAuthFetch();
    render(<TestFolderPicker value={null} onChange={vi.fn()} authFetch={authFetch} />);

    await waitFor(() => expect(authFetch).toHaveBeenCalledWith('/api/test-folders'));
    expect((screen.getByLabelText('Folder') as HTMLInputElement).value).toBe('Unfiled');
  });

  it('shows a suggested path as something that does not exist yet', async () => {
    const authFetch = stubAuthFetch();
    render(
      <TestFolderPicker
        value={null}
        onChange={vi.fn()}
        authFetch={authFetch}
        pendingPath={['Foundation', 'Climatology']}
      />,
    );

    await waitFor(() => expect(authFetch).toHaveBeenCalled());
    expect((screen.getByLabelText('Folder') as HTMLInputElement).value).toBe(
      'Foundation > Climatology',
    );
    // The distinction matters: this one is committed as a path for the server to
    // materialise, not as an id.
    expect(screen.getByText(/will be created/i)).toBeDefined();
  });

  it('hands back the id and the whole path, which is what the prompt needs', async () => {
    const authFetch = stubAuthFetch();
    const onChange = vi.fn();
    render(<TestFolderPicker value={null} onChange={onChange} authFetch={authFetch} />);
    await waitFor(() => expect(authFetch).toHaveBeenCalled());

    await openPicker();
    fireEvent.click(screen.getByText('History of Architecture'));
    fireEvent.click(screen.getByRole('button', { name: /use history of architecture/i }));

    expect(onChange).toHaveBeenCalledWith('history', ['Foundation', 'History of Architecture']);
  });

  it('leaves the test in Unfiled without inventing a folder', async () => {
    const authFetch = stubAuthFetch();
    const onChange = vi.fn();
    render(<TestFolderPicker value={null} onChange={onChange} authFetch={authFetch} />);
    await waitFor(() => expect(authFetch).toHaveBeenCalled());

    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: /leave in unfiled/i }));

    expect(onChange).toHaveBeenCalledWith(null, []);
  });

  it('creates a folder inside the one that is selected', async () => {
    const authFetch = stubAuthFetch();
    const onChange = vi.fn();
    render(<TestFolderPicker value={null} onChange={onChange} authFetch={authFetch} />);
    await waitFor(() => expect(authFetch).toHaveBeenCalled());

    await openPicker();
    fireEvent.click(screen.getByText('Foundation'));
    fireEvent.click(screen.getByRole('button', { name: /new folder/i }));
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'Climatology' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(authFetch).toHaveBeenCalledWith('/api/test-folders', {
        method: 'POST',
        body: JSON.stringify({ name: 'Climatology', parent_id: 'foundation' }),
      }),
    );

    // Selected on creation, and reported with the parent in front of it, so the
    // teacher does not have to find it in the tree afterwards.
    fireEvent.click(await screen.findByRole('button', { name: /use climatology/i }));
    expect(onChange).toHaveBeenCalledWith('created-id', ['Foundation', 'Climatology']);
  });

  it('creates at the top level when nothing is selected', async () => {
    const authFetch = stubAuthFetch();
    render(<TestFolderPicker value={null} onChange={vi.fn()} authFetch={authFetch} />);
    await waitFor(() => expect(authFetch).toHaveBeenCalled());

    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: /new folder/i }));
    expect(screen.getByText('At the top level')).toBeDefined();
  });

  it('searches on the full path, so a nested folder is reachable by its parent', async () => {
    const authFetch = stubAuthFetch();
    const onChange = vi.fn();
    render(<TestFolderPicker value={null} onChange={onChange} authFetch={authFetch} />);
    await waitFor(() => expect(authFetch).toHaveBeenCalled());

    await openPicker();
    fireEvent.change(screen.getByLabelText('Search folders'), { target: { value: 'foundation' } });

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Foundation',
      'Foundation > History of Architecture',
    ]);
  });
});
