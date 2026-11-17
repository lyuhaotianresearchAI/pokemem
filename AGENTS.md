# AGENTS.md

给在这个仓库里干活的 agent（包括 Hanyu 的 agent）看的协作规矩。

## 每次 PR 落地都要更新 README

- 每个 PR 自带对应的 README 更新（changelog + 功能说明），不要等事后补。
- 目标：main 的 README 永远是最新进展，任何 agent 打开 README 就能知道项目现在是什么状态。

## 文件独立性

- 每个文件只负责自己的功能，不要有一个巨大的文件。
- 新功能单独成文件，不要往已有大文件里塞（例如卡片成长逻辑在 `card-progress.js`，不在 `gacha.js`；场景在 `js/scenes.js`，遭遇战状态机在 `js/encounter.js`）。
- 新文件要在 `index.html` 的加载顺序里登记，并在各测试文件的加载列表里补上（smoke / detail-tabs / legacy-repair / pack-close 等都有自己的文件列表）。
