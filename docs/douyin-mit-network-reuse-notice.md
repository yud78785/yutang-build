# YuTang Douyin comment data integration — MIT source notices

This experimental branch reuses the public comment API contract and data-normalization
fields from the following independently implemented MIT projects. Only read-only
comment response parsing ideas/data field mappings are used; neither project is
installed, and no posting, sign-in, private API signing, stealth, or active fetching
code is included.

1. [qinuoyun/douyin](https://github.com/qinuoyun/douyin), pinned branch commit
   `7b0a7ec2792600cff3616191866c4d82309a1e47`
   - `scripts/douyin.user.js` blob `e1e58a0ee9c0fb5ecbdfaeda1025de996e8e50a7`
   - `lib/commands/helpers.js`: `cid`, `text`, `digg_count`,
     `reply_comment_total`, `create_time`; comment API route
     `/aweme/v1/web/comment/list/` with `aweme_id`.
   - `LICENSE` blob `14fac913ccf80234b1848540089a3bbcb6e5283d`.
2. [Tommyapi/OpenMediaCrawl](https://github.com/Tommyapi/OpenMediaCrawl),
   pinned branch commit `cd69576e9b5609654bbbeefdae738e0e1f13eff8`
   - `src/platforms/douyin/web/normalize.ts` blob
     `7c89b4bf0eef55e9ae7a05174f32fbfcd7d724c3`
   - `comment(c,itemId)` uses `cid`, `aweme_id` (fallback to requested
     item ID), `reply_id`, `text`, `digg_count`, `reply_comment_total`.
   - `LICENSE` blob `01aab2ab565460fad898c70f04d927a3fc67ba47`.

This project's new `tools/douyin-passive-comment-network.mjs` is a
limited, fail-closed adaptation; it does not directly use the original server,
userscript or their network request methods. It only listens to responses
the current verified Playwright page already receives. Source and tests should
be checked before integration with an actual browser. No real website acceptance
is claimed.

## License notice — qinuoyun/douyin

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## License notice — Tommyapi/OpenMediaCrawl

MIT License

Copyright (c) 2026 cv-cat
Copyright (c) 2026 tommyapi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
