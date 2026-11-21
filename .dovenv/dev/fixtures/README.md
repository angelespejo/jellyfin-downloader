# Development fixtures

These files are downloaded by `pnpm mock:fetch` and are not committed. They are
20-second excerpts of **public-domain** films from the Internet Archive, used
only for development and testing of the fake Jellyfin API.

| Film | Year | Source | File |
|---|---:|---|---|
| The General | 1926 | https://archive.org/details/TheGeneral1926 | `The_General_1926_720p_512kb.mp4` |
| His Girl Friday | 1940 | https://archive.org/details/his_girl_friday | `his_girl_friday_512kb.mp4` |
| Night of the Living Dead | 1968 | https://archive.org/details/NightOfTheLivingDead_201508 | `Night of the Living Dead.mp4` |

All three are considered public domain in the United States (published without
the required copyright notice or with a copyright that was not renewed). Public
domain status can differ in other jurisdictions; these files are for local
development only.

The subtitles are original text created for these tests and do not reproduce
movie dialogue. Posters are frames extracted from the clips.

The clips are re-encoded to 480p and remuxed to test:

1. MKV with embedded and external subtitles.
2. MP4 with an external VTT.
3. Multi-audio MKV with embedded ASS/SRT and an external SRT.
