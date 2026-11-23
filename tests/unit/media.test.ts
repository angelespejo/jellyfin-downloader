import assert from 'node:assert/strict'
import test from 'node:test'
import type { JellyfinItem } from '#api/_shared/jellyfin-types.ts'
import {
  episodeCode,
  mediaDisplayTitle,
  mediaKind,
  toMovieSummary,
  toSeriesDetail,
} from '#api/_shared/media.ts'

const source = {
  Id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  Name: 'Main',
  Container: 'mkv',
  Size: 1000,
  ETag: 'etag',
  RunTimeTicks: 20 * 10_000_000,
  MediaStreams: [
    { Index: 0, Type: 'Video', Codec: 'h264', Width: 1920, Height: 1080 },
    { Index: 1, Type: 'Audio', Codec: 'aac', Language: 'eng' },
  ],
}

const episode: JellyfinItem = {
  Id: '55555555555555555555555555555555',
  Name: 'The General',
  Type: 'Episode',
  SeriesId: '44444444444444444444444444444444',
  SeriesName: 'Public Domain Matinee',
  ParentIndexNumber: 1,
  IndexNumber: 2,
  ProductionYear: 1926,
  MediaSources: [source],
}

test('maps Jellyfin item types to catalog kinds', () => {
  assert.equal(mediaKind({ Id: 'a'.repeat(32), Name: 'Movie' }), 'movie')
  assert.equal(mediaKind({ Id: 'a'.repeat(32), Name: 'Show', Type: 'Series' }), 'series')
  assert.equal(mediaKind(episode), 'episode')
  assert.equal(mediaKind({ Id: 'a'.repeat(32), Name: 'Clip', Type: 'Video' }), 'homevideo')
})

test('builds episode codes and display titles', () => {
  assert.equal(episodeCode(episode), 'S01E02')
  assert.equal(mediaDisplayTitle(episode), 'Public Domain Matinee S01E02 - The General')
})

test('episode summaries keep series metadata and download counts', () => {
  const summary = toMovieSummary(episode, 3)
  assert.equal(summary.kind, 'episode')
  assert.equal(summary.seriesName, 'Public Domain Matinee')
  assert.equal(summary.seasonNumber, 1)
  assert.equal(summary.episodeNumber, 2)
  assert.equal(summary.downloadCount, 3)
  assert.equal(summary.media?.maxHeight, 1080)
  assert.equal(summary.media?.sizeBytes, 1000)
})

test('series detail includes its episodes', () => {
  const detail = toSeriesDetail(
    {
      Id: '44444444444444444444444444444444',
      Name: 'Public Domain Matinee',
      Type: 'Series',
      ProductionYear: 1926,
    },
    [episode],
    new Map([[episode.Id, 1]])
  )
  assert.equal(detail.kind, 'series')
  assert.equal(detail.episodes.length, 1)
  assert.equal(detail.episodes[0]?.downloadCount, 1)
  assert.equal(detail.totalSizeBytes, null)
  assert.equal(detail.unavailableEpisodes, 0)
  const withUnavailable = toSeriesDetail(
    { Id: '4'.repeat(32), Name: 'Series', Type: 'Series' },
    [episode],
    new Map(),
    3
  )
  assert.equal(withUnavailable.unavailableEpisodes, 3)
})
