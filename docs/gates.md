# 发布闸门（三条，顺序固定）

```
design/*.json ──gen_cards.py──▶ .build/*.svg ──validate.py──▶ 通过?
        │                                                      │
        └── design/cards.json 决定生成哪些卡片                  ▼
                        publish.sh（原子替换 + 版本戳）──▶ profile/*.svg
                                                          │
                                         validate_readme.py ┘  不通过就不提交
```

| 闸门 | 守什么 | 拒绝条件（任一命中整批失败） |
|---|---|---|
| `validate.py` | 生成的卡片本身 | 单卡 > 220 KB、含 `<script>`/`javascript:`、含外链、XML 不良构、必备卡片缺失 |
| `publish.sh` | 线上不中断 | 先整目录校验，再 `.staging.$$ → mv` 原子替换，每张卡写构建戳 |
| `validate_readme.py` | 线上真正被读到的那层 | 未登记占位符、相对路径不存在或大小写不符、锚点无对应 id、`<picture>` 不成对、标签开合不匹配、行内 `<svg>`、孤儿卡片、卡片超预算、中英不对齐 |

## 三条硬规则

1. **预算只许往下调**（棘轮）：`validate.py: MAX_BYTES`、`validate_readme.py: CARD_MAX_BYTES / PROFILE_BUDGET`。要放宽必须先说明理由。
2. **占位符必须登记**：`validate_readme.py: KNOWN_PLACEHOLDERS`。清单外的 `YOUR_*` 直接拒绝——这样"复制模板忘改"（`YOUR-USERNAME`、`YOUR_EMAIL`）不会上线。修好一个就删掉一条。
3. **发布目录 `profile/` 只放被 README 引用的文件**。中间产物（如 `quest-lossy.webp`）写 `.tmp/`；不再引用的卡片从 `design/cards.json` 的 `publish` 里摘掉并归档到 `retired`。

## 本地自查

```bash
python .github/scripts/validate_readme.py           # 当前：应为 PASS + 4 WARN
python .github/scripts/validate_readme.py --strict  # 连 WARN 都不放过（清完占位符后用）
```

## 已知待办

- `YOUR_EMAIL`（README 两处 + `site/src/data/site.ts`）：换成真邮箱后，从 `KNOWN_PLACEHOLDERS` 删掉，并把 `readme.yml` 的那行改成 `--strict`。
- `README.md` / `README.zh-CN.md` 各有重复的 `id="stack"`（WARN，暂不影响锚点跳转）。
