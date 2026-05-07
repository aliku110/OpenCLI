import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { __test__ } from './bookmark-folder.js';

const { parseBookmarkFolderTimeline, buildFolderTimelineUrl } = __test__;

describe('twitter bookmark-folder URL builder', () => {
    it('embeds the folder id and count in the variables payload', () => {
        const url = buildFolderTimelineUrl('queryX', '12345', 50, null);
        const m = url.match(/variables=([^&]+)/);
        const vars = JSON.parse(decodeURIComponent(m[1]));
        expect(vars.bookmark_collection_id).toBe('12345');
        expect(vars.count).toBe(50);
        expect(vars.includePromotedContent).toBe(false);
        expect(vars.cursor).toBeUndefined();
    });

    it('appends the cursor when one is supplied', () => {
        const url = buildFolderTimelineUrl('queryX', '12345', 50, 'CURSOR_VAL');
        const m = url.match(/variables=([^&]+)/);
        const vars = JSON.parse(decodeURIComponent(m[1]));
        expect(vars.cursor).toBe('CURSOR_VAL');
    });

    it('coerces a numeric folder id to a string', () => {
        const url = buildFolderTimelineUrl('queryX', 555, 10);
        const m = url.match(/variables=([^&]+)/);
        const vars = JSON.parse(decodeURIComponent(m[1]));
        expect(vars.bookmark_collection_id).toBe('555');
    });
});

describe('twitter bookmark-folder timeline parser', () => {
    it('extracts tweets from bookmark_timeline_v2 envelope', () => {
        const data = {
            data: {
                bookmark_timeline_v2: {
                    timeline: {
                        instructions: [
                            {
                                type: 'TimelineAddEntries',
                                entries: [
                                    {
                                        entryId: 'tweet-1',
                                        content: {
                                            itemContent: {
                                                tweet_results: {
                                                    result: {
                                                        rest_id: '1',
                                                        legacy: {
                                                            full_text: 'first folder tweet',
                                                            favorite_count: 9,
                                                            retweet_count: 2,
                                                            bookmark_count: 3,
                                                            created_at: 'Tue Mar 17 09:00:00 +0000 2026',
                                                        },
                                                        core: {
                                                            user_results: {
                                                                result: { core: { screen_name: 'alice' } },
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    {
                                        entryId: 'cursor-bottom-X',
                                        content: {
                                            __typename: 'TimelineTimelineCursor',
                                            cursorType: 'Bottom',
                                            value: 'NEXT_CURSOR',
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        };
        const { tweets, nextCursor } = parseBookmarkFolderTimeline(data, new Set());
        expect(tweets).toEqual([
            {
                id: '1',
                author: 'alice',
                text: 'first folder tweet',
                likes: 9,
                retweets: 2,
                bookmarks: 3,
                created_at: 'Tue Mar 17 09:00:00 +0000 2026',
                url: 'https://x.com/alice/status/1',
            },
        ]);
        expect(nextCursor).toBe('NEXT_CURSOR');
    });

    it('falls back to bookmark_collection_timeline envelope', () => {
        const data = {
            data: {
                bookmark_collection_timeline: {
                    timeline: {
                        instructions: [
                            {
                                entries: [
                                    {
                                        entryId: 'tweet-2',
                                        content: {
                                            itemContent: {
                                                tweet_results: {
                                                    result: {
                                                        rest_id: '2',
                                                        legacy: { full_text: 'collection envelope', favorite_count: 1, retweet_count: 0, bookmark_count: 0 },
                                                        core: { user_results: { result: { legacy: { screen_name: 'bob' } } } },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        };
        const { tweets } = parseBookmarkFolderTimeline(data, new Set());
        expect(tweets).toHaveLength(1);
        expect(tweets[0].id).toBe('2');
        expect(tweets[0].author).toBe('bob');
    });

    it('uses note_tweet text when present (long-form tweets)', () => {
        const data = {
            data: {
                bookmark_timeline_v2: {
                    timeline: {
                        instructions: [{
                            entries: [{
                                entryId: 'tweet-3',
                                content: {
                                    itemContent: {
                                        tweet_results: {
                                            result: {
                                                rest_id: '3',
                                                legacy: { full_text: 'short text', favorite_count: 0, retweet_count: 0, bookmark_count: 0 },
                                                note_tweet: { note_tweet_results: { result: { text: 'full long-form text' } } },
                                                core: { user_results: { result: { core: { screen_name: 'carol' } } } },
                                            },
                                        },
                                    },
                                },
                            }],
                        }],
                    },
                },
            },
        };
        const { tweets } = parseBookmarkFolderTimeline(data, new Set());
        expect(tweets[0].text).toBe('full long-form text');
    });

    it('deduplicates tweets across the seen Set', () => {
        const data = {
            data: {
                bookmark_timeline_v2: {
                    timeline: {
                        instructions: [{
                            entries: [
                                {
                                    entryId: 'tweet-4',
                                    content: {
                                        itemContent: {
                                            tweet_results: {
                                                result: {
                                                    rest_id: '4',
                                                    legacy: { full_text: 'first', favorite_count: 0, retweet_count: 0, bookmark_count: 0 },
                                                    core: { user_results: { result: { core: { screen_name: 'dan' } } } },
                                                },
                                            },
                                        },
                                    },
                                },
                                {
                                    entryId: 'tweet-4-dup',
                                    content: {
                                        itemContent: {
                                            tweet_results: {
                                                result: {
                                                    rest_id: '4',
                                                    legacy: { full_text: 'duplicate' },
                                                    core: { user_results: { result: { core: { screen_name: 'dan' } } } },
                                                },
                                            },
                                        },
                                    },
                                },
                            ],
                        }],
                    },
                },
            },
        };
        const seen = new Set();
        const { tweets } = parseBookmarkFolderTimeline(data, seen);
        expect(tweets).toHaveLength(1);
        expect(tweets[0].text).toBe('first');
    });

    it('returns empty array + null cursor for unknown envelope', () => {
        expect(parseBookmarkFolderTimeline({}, new Set())).toEqual({ tweets: [], nextCursor: null });
    });
});

describe('twitter bookmark-folder command (registry)', () => {
    it('throws ArgumentError on non-numeric folder-id', async () => {
        const command = getRegistry().get('twitter/bookmark-folder');
        expect(command?.func).toBeTypeOf('function');
        const page = {
            goto: vi.fn(),
            wait: vi.fn(),
            evaluate: vi.fn(),
        };
        await expect(command.func(page, { 'folder-id': 'not-a-number', limit: 5 }))
            .rejects
            .toThrow(/Invalid folder-id/);
        expect(page.goto).not.toHaveBeenCalled();
    });

    it('throws ArgumentError on empty folder-id', async () => {
        const command = getRegistry().get('twitter/bookmark-folder');
        const page = {
            goto: vi.fn(),
            wait: vi.fn(),
            evaluate: vi.fn(),
        };
        await expect(command.func(page, { 'folder-id': '   ', limit: 5 }))
            .rejects
            .toThrow(/Invalid folder-id/);
    });

    it('throws AuthRequiredError when ct0 cookie is missing', async () => {
        const command = getRegistry().get('twitter/bookmark-folder');
        const page = {
            goto: vi.fn().mockResolvedValue(undefined),
            wait: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue(null),
        };
        await expect(command.func(page, { 'folder-id': '12345', limit: 5 }))
            .rejects
            .toThrow(/Not logged into x.com/);
    });
});
