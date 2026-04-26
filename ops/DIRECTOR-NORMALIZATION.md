# Director Normalization Worksheet

**Source:** `data/audit-report.json` → `directorVariations` (192 clusters flagged by the heuristic).
**Goal:** reduce 1,172 unique director values to a clean canonical set. Estimated true count ≈ 1,090-1,110 after dedup.
**Where to action:** Notion Films DB → bulk find/replace on the `Director` text property.

The audit's clustering is noisy — it groups any directors with similar surnames or shared tokens, which sweeps up unrelated people (Hayao Miyazaki ↔ Goro Miyazaki, Tim Burton ↔ Tom Burton, Don Bluth ↔ Don Lusk). I've sorted every cluster into one of four buckets so you can move fast without misreading the data.

---

## Bucket A — MERGE (same director, different romanization or spelling)

These are safe one-shot find/replace. Pick the **canonical form** (right column) and replace every occurrence of variants (left column).

| Variants → MERGE INTO ↓ | Canonical | Notes |
|---|---|---|
| `Shoji Kawamori` | `Shōji Kawamori` | macron |
| `Shukō Murase` | `Shūkō Murase` | macron |
| `Goro Taniguchi` | `Gorō Taniguchi` | macron |
| `Kobun Shizuno` | `Kōbun Shizuno` | macron |
| `Hiroaki Ando` | `Hiroaki Andō` | macron |
| `Koji Morimoto` | `Kōji Morimoto` | macron |
| `Ichiro Itano` | `Ichirō Itano` | macron |
| `Kō Matsuo` ↔ `Kou Matsuo` | `Kō Matsuo` | "ou" → ō |
| `Yugo Serikawa` | `Yūgo Serikawa` | macron |
| `Seitaro Hara` | `Seitarō Hara` | macron |
| `Bretislav Pojar` | `Břetislav Pojar` | diacritic |
| `Yuri Norstein` ↔ `Yuriy Norshteyn` | `Yuri Norstein` | English-standard romanization |
| `Yefim Gamburg` ↔ `Efim Gamburg` | `Yefim Gamburg` | |
| `Stephan Martinière` ↔ `Stéphane Martinière` | `Stéphane Martinière` | |
| `Akitaro Daichi` | `Akitarō Daichi` | macron |
| `Hidekazu Sato` | `Hidekazu Satō` | macron |
| `Koichi Mashimo` | `Kōichi Mashimo` | macron |
| `Koichi Chigira` | `Kōichi Chigira` | macron |
| `Ryosuke Takahashi` ↔ `Ryōsuke Takahashi` ↔ `Ryousuke Takahashi` | `Ryōsuke Takahashi` | macron |
| `Tatsuo Satō` ↔ (NOT `Takuya Satō`) | keep both, distinct | |
| `Toyoo Ashida (1944-2011)` | `Toyoo Ashida` | strip lifespan |
| `Yoram Gross (1926-2015)` | `Yoram Gross` | strip lifespan |
| `Bill Hutton` ↔ `Bill Hutten` | `Bill Hutten` | spelling drift; verify which is correct |
| `Gennady Sokolsky` ↔ `Gennadiy Sokolskiy` ↔ `Sokolsky` | `Gennady Sokolsky` | |
| `Leonid Nosyrev` ↔ `Nosyrev` | `Leonid Nosyrev` | |
| `Heo Pyeong-gang` ↔ `Ho Pyeon-gang` | `Heo Pyeong-gang` | RR romanization |
| `Su Chun-Hsu` ↔ `Chun-Hsu Su` | `Su Chun-Hsu` | family-name first |
| `Cai Mingqin` ↔ `Tsai Ming-Chin` | pick one — Pinyin (`Cai Mingqin`) for mainland, Wade-Giles for Taiwan |
| `Wang Borong` ↔ `Wang Bairong` | likely same person; verify in Notion |
| `Qian Jiajun` ↔ `Qian Jiaxin` | likely same person; verify |
| `Katsumi Minokuchi` ↔ `Katsumi Minoguchi` | spelling drift |
| `Shouji Saeki` ↔ `Shoji Saeki` | `Shoji Saeki` |
| `Mike Johnson` ↔ `Duke Johnson` | **DIFFERENT** — co-directors of *Anomalisa*; leave separate |
| `Brothers Quay` cluster (`Stephen Quay`, `others)`) | `Brothers Quay` | strip the broken parse |
| `Te Wei` ↔ `Te Wei (特伟)` | `Te Wei` | strip CJK reduplication |
| `Liu Huiyi (刘蕙仪)` | `Liu Huiyi` | strip CJK reduplication |
| `Li Yao (李耀)` | `Li Yao` | strip CJK reduplication |
| `Sano Yuta (佐野雄太)` | `Sano Yuta` | strip CJK reduplication |
| `Lin Minghao (林铭浩)` | `Lin Minghao` | strip CJK reduplication |
| `Zhou Chen (周琨)` | `Zhou Chen` | strip CJK reduplication |
| `Peter Chung (creator)` | `Peter Chung` | |

### A2 — Episode/season annotations to strip

These are the same director with crew-credit metadata leaking in. Replace the parenthetical version with the bare name (or split out a real co-director if one is named).

| Replace | With |
|---|---|
| `Mamoru Oshii (eps 1–106)` | `Mamoru Oshii` |
| `Masahiko Murata (S1)` | `Masahiko Murata` |
| `Hiroshi Hamasaki (S1)` | `Hiroshi Hamasaki` |
| `Koichi Chigira (S1)` | `Kōichi Chigira` |
| `Charles A. Nichols (S1-5)` ↔ `Charles A. Nichols (director)` | `Charles A. Nichols` |
| `John Kimball (S1)` | `John Kimball` |
| `Rudy Larriva (S1-3)` ↔ `Rudy Larriva)` | `Rudy Larriva` |
| `Carl Urbano (Season 1); Oscar Dufau` | split → `Carl Urbano` AND `Oscar Dufau` |
| `Gwen Wetzler (animation director)` | `Gwen Wetzler` |
| `George Gordon (Season 2)` | `George Gordon` |
| `Kent Butterworth (S6)` | `Kent Butterworth` |
| `Chuck Patton (S2)` | `Chuck Patton` |
| `Robert Alvarez (director)` | `Robert Alvarez` |
| `Jean Chalopin (creator/producer)` ↔ `Jean Chalopin (creator)` | `Jean Chalopin` |
| `Ron Myrick (season 1)` | `Ron Myrick` |
| `Tomoharu Katsumata et al.` | `Tomoharu Katsumata` |
| `Satoshi Dezaki (#1–15)` | `Satoshi Dezaki` |
| `Hisayuki Toriumi (original anime)` | `Hisayuki Toriumi` |
| `Takeyuki Kanda (ep. 1–6)` | `Takeyuki Kanda` |
| `Umanosuke Iida (ep. 7–12)` | `Umanosuke Iida` |
| `Takayuki Inagaki (eps 1-9)` | `Takayuki Inagaki` |
| `Masaomi Ando (eps 10-24)` | `Masaomi Ando` |
| `Masahiko Ōta` ↔ `Masahiko Ohta` | `Masahiko Ōta` |
| `Takashi Imanishi (director)` | `Takashi Imanishi` |
| `Yoshikazu Yasuhiko (chief director)` | `Yoshikazu Yasuhiko` |
| `Takeshi Mori (co-director)` | `Takeshi Mori` |
| `Hiroshi Negishi (Chief Director: Jun Takada)` | split → `Hiroshi Negishi` AND `Jun Takada` |
| `Katsuyuki Motohiro (chief)` | `Katsuyuki Motohiro` |
| `Shōji Kawamori (chief director)` ↔ `Shōji Kawamori (chief)` | `Shōji Kawamori` |
| `Noboru Ishiguro (supervising)` | `Noboru Ishiguro` |
| `Noboru Ishiguro (original); Leiji Matsumoto (concept)` | split → `Noboru Ishiguro` AND `Leiji Matsumoto` |
| `José Alejandro García Muñoz (Series Director)` | `José Alejandro García Muñoz` |
| `Yoshiaki Kawajiri (b. 1950)` | `Yoshiaki Kawajiri` |
| `Karen Hydendahl (supervising)` | `Karen Hydendahl` |
| `Dan Riba (animation)` | `Dan Riba` |
| `Ray Patterson (supervising director)` ↔ `Ray Patterson (supervising directors)` | `Ray Patterson` |
| `Jules Bass (executive producers)` | `Jules Bass` |
| `Joseph Barbera (directors); Doug Wildey (creator/designer)` | split → `Joseph Barbera` AND `Doug Wildey` |
| `William Hanna & Joseph Barbera (executive producers)` | split → `William Hanna` AND `Joseph Barbera` |
| `William Hanna (Hanna-Barbera); created by David Kirschner` | split → `William Hanna` AND `David Kirschner` |
| `Various (created by Aleksandr Tatarsky)` | `Aleksandr Tatarsky` |
| `Genndy Tartakovsky (creator/showrunner S1-2); Chris Savino (showrunner S3-4)` | split → `Genndy Tartakovsky` AND `Chris Savino` |
| `Craig McCracken (creator/showrunner S1-4); Chris Savino (showrunner S5-6)` | split → `Craig McCracken` AND `Chris Savino` |
| `Camille Prinele; Will Meugniot (supervising director)` | split → `Camille Prinele` AND `Will Meugniot` |
| `Lou Scheimer (producer); various episode directors` | `Lou Scheimer` |
| `Hiroshi Negishi (Chief Director: Jun Takada)` | split → `Hiroshi Negishi` AND `Jun Takada` |
| `Mamoru Oshii (eps 1–106)` | `Mamoru Oshii` |
| `Tomoharu Katsumata et al.` | `Tomoharu Katsumata` |
| `Various (Hal Sutherland` (broken parse) | `Hal Sutherland` |
| `Brad Bird` (correct, leave) | — |
| `Brothers Quay (Stephen Quay` ↔ `others)` (broken parse) | `Brothers Quay` |
| `Various (10 African directors: Ahmed Teilab` ↔ `Various` ↔ `various` | normalize to `Various` |
| `Raymond Jafelice (Nelvana pilot); no director credited for DIC series` | `Raymond Jafelice` |
| `Ryutaro Makihara` cluster vs `Ryūtarō Nakamura` — DIFFERENT people, leave |
| `Steven Hahn` ↔ `Steve Clark)` | split — `Steven Hahn` is real; `Steve Clark)` is broken parse, delete |
| `Tensho` ↔ `TSR)` | `Tensho`; delete `TSR)` |

---

## Bucket B — GARBAGE (delete these stray fragments)

These are parser detritus — orphan tokens from comma/paren splits. Find each in Notion and either delete the row or merge into the parent entry.

| Garbage value | Likely from |
|---|---|
| `etc.)` | (multi-director cluster row) |
| `others)` | "Brothers Quay (Stephen Quay, others)" parse |
| `Liu Yi)` | (Chinese co-director cluster) |
| `Steve Clark)` | (Steven Hahn / Steve Clark cluster) |
| `TSR)` | (Tensho cluster) |
| `Bardin` | unclear — may be valid (Garri Bardin?) — verify before deleting |
| `Ugarov` | likely Sergei Ugarov — promote to full name |
| `Nazarov` | likely Eduard Nazarov — promote to full name |
| `Picha` | actual director (Belgian, *Tarzoon*); leave |
| `Mankyuu` | actual director alias; verify |

---

## Bucket C — FALSE POSITIVES (DO NOT MERGE — these are different people)

The clustering heuristic grouped these by token similarity but they are distinct directors. Leave them alone in Notion.

`Bong Joon-ho` ≠ `Dongwoo Ko` · `Mamoru Oshii` ≠ `Mamoru Hosoda` · `Hayao Miyazaki` ≠ `Goro Miyazaki` · `Brad Bird` ≠ `Brad Rau` ≠ `Brad Rader` ≠ `Alê Abreu` · `Christopher Nolan` ≠ `Christopher Nielsen` · `Tim Burton` ≠ `Tom Burton` · `Don Bluth` ≠ `Don Lusk` · `Isao Takahata` ≠ `Iwao Takamoto` · `Satoshi Kon` ≠ `Satoshi Saga` · `Hideaki Anno` ≠ `Hiroaki Andō` ≠ `Hiroaki Sato` · `Sam Liu` ≠ `Sam Fell` ≠ `Sun Lijun` ≠ `Ray Lee` · `Ari Folman` ≠ `Gary Goldman` · `Chris Sanders` ≠ `Chris Landreth` ≠ `Chris Marker` · `Tomm Moore` ≠ `Tom Root` ≠ `Herb Moore` · `Joung Yumi` ≠ `John Grusd` · `John Hubley` ≠ `John Musker` · `Mamoru Oshii` ≠ `Mamoru Hosoda` · `Mitsuo Iso` ≠ `Mitsuko Kase` ≠ `Mitsuyo Seo` · `Pablo Berger` ≠ `Pablo Holcer` · `Tetsurō Araki` ≠ `Tetsurō Amino` · `Shinji Aramaki` ≠ `Shin Itagaki` · `Koji Yamamura` ≠ `Kenji Nakamura` · `Atsushi Takahashi` ≠ `Atsushi Takeuchi` · `Hiroyuki Seshita` ≠ `Hiroyuki Morita` · `Kazuya Murata` ≠ `Kazuya Nomura` · `Shunsuke Tada` ≠ `Shinsuke Sato` · `Yōhei Suzuki` ≠ `Iku Suzuki` · `Tatsuo Satō` ≠ `Takuya Satō` · `Tomohiko Itō` ≠ `Tomoki Kyoda` · `Keisuke Ide` ≠ `Kōnosuke Uda` · `ZiFeng Li` ≠ `Kim Eun-gi` · `Naoyuki Itō` ≠ `Naoyuki Onda` · `Max Lang` ≠ `Mao Lamdo` · `Tatsuyuki Nagai` ≠ `Tatsuyuki Tanaka` · `Keiichi Hara` ≠ `Keiichi Satou` ≠ `Keiichi Sato` ≠ `Koichi Ohata` (Sato/Satou are likely same — see Bucket A) · `Hiroshi Nagahama` ≠ `Hiroshi Sasagawa` · `Hiroshi Nishikiori` ≠ `Hiroshi Ishiodori` · `Hiroyuki Kakudō` ≠ `Hiroyuki Kitakubo` · `Katsuhito Akiyama` ≠ `Katsumi Akiyama` · `David Lane` ≠ `Dai Tielang` · `Masahiko Kubo` ≠ `Masahiko Ohta` · `Morio Asaka` ≠ `Mori Masaki` · `Juan Padrón` ≠ `Audu Paden` · `Joe Pearson` ≠ `Ian Pearson` · `John Fox` ≠ `John Korty` · `Hu Jinqing` ≠ `Qu Jianfang` · `Yoriyasu Kogawa` ≠ `Noriyasu Ogami` · `Andrew Duncan` ≠ `Andrew Chan` · `Jeff Allen` ≠ `Jeff Hale` · `Pat Griffiths` ≠ `Keith Griffiths` · `Eric Brown` ≠ `Dick Brown` · `Mikhail Titov` ≠ `Mikhail Botov` · `Vladimir Popov` ≠ `Vladimir Pekar` · `Alina Kotowska` ≠ `Anna Kotowska` (verify — may be sisters) · `Jiří Trnka` ≠ `Jiří Krejčík` · `Bingjun Xia` ≠ `Bingduo Xu` · `Dave Fleischer` ≠ `Max Fleischer` · `Nikolai Khodatayev` ≠ `Nikolay Khodataev` (these ARE same — move to A) · `Tomohiko Itō` ≠ `Tomoki Kyoda` · `Toshihiko Masuda` ≠ `Toshio Masuda` · `Richard Rich` ≠ `Rich Rudish` · `Yan Shanchun` ≠ `Wan Chaochen` · `Cheng Teng` ≠ `Chen Bo'er` · `Amp Wong` ≠ `Gary Wang` · `Rémi Chayé` ≠ `Ram Mohan` · `Stephen Quay` ≠ `Stephen Hahn` · `Ha Huy Hoang` ≠ `Hu Yihong` · `Xie Junwei` ≠ `Liu Wei` · `Simin He` ≠ `VIVINOS` · `Michael Arias` ≠ `Michael Maliani` · `Takashi Watanabe` ≠ `Hiroshi Watanabe` · `Masashi Kudō` ≠ `Masashi Ando` ≠ `Masashi Abe` ≠ `Masashi Ikeda` · `Hajime Katoki` ≠ `Hajime Kamegaki` · `Yutaka Yamamoto` ≠ `Yasutaka Yamamoto` ≠ `Yusaku Sakamoto` · `Toshiyuki Katō` ≠ `Toshiyuki Kanno` · `Jun Awazu` ≠ `Jun Kawagoe` · `Michael Chang` ≠ `Michael Schaack` · `Hiroshi Negishi` ≠ `Jun Takada` · `Katsuhiko Taguchi` ≠ `Takeyuki Kanda` (may be co-credited — verify) · `Tadao Nagahama` ≠ `Katsutoshi Sasaki` · `Kristina Đuković` ≠ `Kristina Dufková` · `Nedeljko Kovačić` ≠ `Nedeljko Dragić` · `Tomoyuki Shimoyama` ≠ `Tomohisa Shimoyama` · `Mel Zwyer` ≠ `Ken Boyer` · `Masami Ōbari` ≠ `Masami Anno` · `Priit Pärn` ≠ `Jérémie Périn` ≠ `Rintaro` ≠ `Rintarō` (last two ARE same — move to A) · `Shofela Coker` ≠ `Shane Acker` · `Ryōji Masuyama` ≠ `Yōji Fukuyama` · `Shōjirō Nishimi` ≠ `Shojiro Nishimi` (these ARE same — move to A) · `Yu Shui` ≠ `Shi Yi` ≠ `You Lei` · `Kenji Mutō` ≠ `Kōji Itō` · `Sarolta Szabó` ≠ `Szabolcs Szabó` (sibling team — keep both) · `Yuki Watanabe` ≠ `Ayumu Watanabe` ≠ `Sumio Watanabe` · `Wang Xin` ≠ `Sung Shin` ≠ `Wang Genfa` ≠ `Wan Guchan` ≠ `Fang Ming` (`Bardin` belongs in B) · `Zhao Ji` ≠ `G.B. Hajim` · `Masayuki Miyaji` ≠ `Masayuki` (`Masayuki` alone is likely the Evangelion EVA director — promote) · `Lin Minghao` ≠ `Lin Wenxiao` · `Zou Jing` ≠ `Leon Ding` ≠ `Song Qing` ≠ `Xu Jingda` ≠ `Wu Qiang` ≠ `Hồ Quảng` · `Christopher Nolan` (verify presence — likely shouldn't be in animation archive at all) · `Goro Miyazaki` ≠ `Hayao Miyazaki` · `Hiroshi Hamasaki` (annotation only — Bucket A2) · `Shinji Ishihira` ≠ `Shinji Ushiro` · `Hayao Miyazaki` is correct · `Stephen Quay` ≠ `Stephen Hahn` · `Joseph Barbera` cluster (parse fragments — Bucket A2) · `John Grace` ≠ `John Gibbs` · `Masayuki Oozeki` ≠ `Masayuki Akehi`

---

## Bucket D — VERIFY (single-letter/initial drift, ambiguous)

Worth a 30-second look in Notion before deciding:

| Cluster | Action |
|---|---|
| `Ilya Maksimov` ↔ `N. Maksimov` | check filmography — may be brothers, may be same person credited differently |
| `Hiroyuki Tanaka` ↔ `Hiroyuki Yamaga` | distinct, leave (Yamaga is Gainax co-founder) |
| `Hiroshi Watanabe` ↔ `Takashi Watanabe` | distinct, leave |
| `Nedeljko Kovačić` ↔ `Nedeljko Dragić` | likely distinct; verify |
| `Cai Mingqin` ↔ `Tsai Ming-Chin` | almost certainly same — pick romanization standard |

---

## How to execute

1. Open Notion → Films DB.
2. Add a temporary filter view: `Director contains "(eps"` or `contains "(S1"` or `contains "(season"`. Walk through each row and apply Bucket A2 fixes. (~30 minutes, ~30 rows.)
3. Repeat for `Director contains "(creator"`, `(supervising)`, `(animation)`, `(executive`, `; ` (semicolon — split rows). (~20 minutes.)
4. Bucket A romanization merges: use Notion bulk edit. Open the Director text column → find/replace per row. (~30 minutes.)
5. Bucket B garbage: filter `Director ends with ")"` and delete or fix. (~10 minutes.)
6. Re-run `npm run audit` locally. Cluster count should drop from ~192 to <30.
7. Commit `data/audit-report.json` so the next CI run picks up the cleaner baseline.

**Total time: ~90-120 minutes of focused Notion work.**
