# Better Agent System

**İstek başına ~610 token'a kıdemli bir mühendislik ekibi.**

[OpenCode](https://opencode.ai) için 25 uzman agent, 39 isteğe bağlı skill ve 8 slash command — derinlik, gerçekten kullanana kadar hiçbir maliyet çıkarmayacak şekilde tasarlandı.

[Türkçe](README.tr.md) · [English](README.md)

[![Sürüm](https://img.shields.io/badge/s%C3%BCr%C3%BCm-3.3.0-blue?style=flat-square)](.opencode/plugins/better-agent-system/package.json)
[![Agent](https://img.shields.io/badge/agent-25-8b5cf6?style=flat-square)](#agentlar)
[![Skill](https://img.shields.io/badge/skill-39-0ea5e9?style=flat-square)](#skilller)
[![Komut](https://img.shields.io/badge/komut-8-10b981?style=flat-square)](#slash-commandlar)
[![Sabit maliyet](https://img.shields.io/badge/sabit%20maliyet-~610%20token-f59e0b?style=flat-square)](#token-ekonomisi)
[![Lisans](https://img.shields.io/badge/lisans-MIT-64748b?style=flat-square)](#lisans)

---

## Neden var

Çoğu "mega prompt", modeli her konuda iyi yapmaya çalışırken her şeyi context'e koyar. Bu çalışır — ta ki **her istekte** bedelini ödeyene ve talimatlar birbiriyle çelişmeye başlayana kadar.

Bu proje tam tersini yapar:

| | Tipik mega prompt | Better Agent System |
|---|---|---|
| İstek başına sabit maliyet | 8.000+ token | **~610 token** |
| Yapı | Her iş için tek prompt | 25 odaklı agent |
| Derinlik | Her zaman yüklü | 39 skill, sadece kullanılınca |
| Model | Sık sık sabit kodlu | **Oturumun modelini izler** |
| İş akışı | Adımları sen hatırlarsın | 8 slash command standartlaştırır |
| Güvenlik | Prompt seviyesinde uyarı | Zorunlu izinler + shell kuralları |

Sonuç: çok daha büyük ve disiplinli bir model gibi davranan, ama bütün gün açık kalacak kadar ucuz bir sistem.

## Özellikler

- **25 uzman agent** — geliştirme, analiz, teslimat, veri/AI ve liderlik.
- **39 isteğe bağlı skill** — somut komutlar, kontrol listeleri ve hata senaryoları.
- **8 slash command** — sürekli tekrarlanan iş akışları: verify, review, debug, ship, onboard, incident, research, PRD.
- **Sıfır sabit model** — her agent oturumda seçtiğin modeli kullanır.
- **Gerçek delegasyon** — tüm agent'lar `all` modunda; `tech-lead` uzmanları subagent olarak paralel çalıştırabilir.
- **Sınırlı özerklik** — agent başına `steps` limiti kaçak döngüleri keser (reviewer 8–12, builder 16–24).
- **Zorunlu güvenlik** — reviewer'lar kod değiştiremez, test agent'ları yalnızca test dosyalarına yazabilir, yıkıcı shell komutları onay ister.
- **CI ve başlangıçta token koruması** — bütçe aşılırsa script hata verir.
- **Global kurulum** — tek komutla sistem her projede kullanılabilir.
- **Doküman araç zinciri** — PDF, Word, PowerPoint ve Excel için izole Python venv.

## Hızlı başlangıç

Gereksinimler: **OpenCode 2.3+**, **Node.js 20+** ve bash (Linux, macOS veya WSL).

```bash
git clone https://github.com/KULLANICI_ADIN/BetterThanClaudeCode.git
cd BetterThanClaudeCode/.opencode/plugins/better-agent-system

# İsteğe bağlı: PDF / DOCX / PPTX / XLSX skill'leri
npm run setup:docs

# Her proje için kur
npm run install:global

# Yeniden başlatmadan uygula
opencode reload
```

Sonra herhangi bir projeyi aç, seçiciden bir agent seç ve normal konuş.

> **Sadece bu projede kullanım:** Bu repoyu OpenCode'da açmak `opencode.jsonc` ve plugin'i zaten yükler. `install:global` yalnızca sistemi her yerde kullanmak için gerekir.

### İlk beş dakika

```text
/onboard                 # tanımadığın repoyu haritala, AGENTS.md yaz
/verify                  # format, lint, typecheck, test ve build çalıştır
/review                  # mevcut diff için önem sıralı inceleme
/debug TypeError in ...  # tekrar üret, izole et, düzelt, regresyon testi ekle
```

## Nasıl çalışır

```text
┌─────────────────────────────────────────────────────────┐
│ OpenCode oturumu — senin modelin, araçların, projen     │
└───────────────────────────┬─────────────────────────────┘
                            │ her istek
              ┌─────────────▼──────────────┐
              │ aktif agent `system`       │  ~90–160 token
              │ + 39 skill açıklaması      │  ~448 token
              └─────────────┬──────────────┘
                            │ tetikleyici eşleşmesi
              ┌─────────────▼──────────────┐
              │ tek skill gövdesi (talep)  │  ≤1.400 token
              └─────────────┬──────────────┘
                            │
              ┌─────────────▼──────────────┐
              │ read · edit · shell · LSP  │
              └────────────────────────────┘
```

OpenCode zaten araçlar, izinler ve düzenleme için güçlü bir temel prompt taşır. Bu sistem **rakip bir temel prompt eklemez**. Her agent kısa bir telgraf tarzı brif taşır; daha derin tarifler yalnızca ihtiyaç duyulan turda yüklenen skill'lerde yaşar.

### Tasarım kuralları

1. **Açıklamalar, skill'lerin tek sürekli maliyetidir.** Kullanıcının gerçekten söyleyeceği kelimeleri içerecek şekilde yazılır.
2. **Derinlik gövdeye aittir, asla açıklamaya değil.** 1.400 token'lık bir skill sabit olarak yalnızca ~12 token tutar.
3. **Context'teki tek agent prompt'u aktif olandır.** Agent eklemek sabit maliyeti artırmaz.
4. **Skill başına tek tetikleyici ailesi.** Çakışan skill'ler üst üste eklenmez, birleştirilir.
5. **Her iddia doğrulanabilir olmalı.** Agent'lar test çalıştırmak, çıktıyı okumak ve doğrulanmamış bilgiyi işaretlemek zorundadır.

## Token ekonomisi

`npm run check:tokens` ile ölçüldü:

| Bileşen | Ne zaman ödenir | Ölçülen |
|---|---|---|
| Aktif agent prompt'u | Her istek | ort. ~145, en fazla ~162 |
| 39 skill açıklaması | Her istek | ~448 |
| **Sabit toplam** | **Her istek** | **~610** |
| Tek skill gövdesi | Sadece tetiklenince | ort. ~330, en fazla 1.400 |
| Tüm skill gövdeleri | Asla | ~12.868 |

`scripts/token-budget.mjs` tarafından zorunlu tutulan bütçeler:

| Bütçe | Limit |
|---|---|
| Agent system prompt | ≤ 180 token |
| Tek skill açıklaması | ≤ 18 token |
| Tüm açıklamalar | ≤ 500 token |
| İstek başına sabit | ≤ 700 token |
| Tek skill gövdesi | ≤ 1.400 token |

```bash
npm run check:tokens        # okunabilir rapor, ihlalde exit 1
npm run check:tokens:json   # makine tarafından okunabilir rapor
```

Koruma ayrıca eksik skill referanslarında, tekrarlanan ID veya açıklamalarda, sabit kodlu agent modellerinde, desteklenmeyen agent anahtarlarında ve system prompt'u olmayan agent'larda hata verir. Plugin aynı kontrolü başlangıçta da tekrarlar.

### Çalışma zamanı kontrolleri

Uzun oturumlar prompt'lardan değil, araç çıktısı ve geçmişten büyür. Config ikisini de sınırlar:

```jsonc
"tool_output": { "max_lines": 500, "max_bytes": 20480 },
"compaction": { "auto": true, "keep": { "tokens": 12000 } }
```

| Kontrol | Etki |
|---|---|
| `tool_output.max_lines` / `max_bytes` | Büyük okumalar ve komut çıktıları diske kırpılır |
| `compaction.auto` + `keep.tokens` | Eski turlar özetlenir, son ~12k token aynen kalır |
| `agents.<id>.steps` | Tur başına agentik iterasyonu sınırlar |

## Agent'lar

25 agent'ın tamamı `mode: "all"` kullanır ve oturumun aktif modelini izler. `default_agent`: `fullstack-expert`.

### Geliştirme

| Agent | Odak | Adım |
|---|---|:---:|
| `frontend-expert` | React, Vue, Svelte, TypeScript, CSS, a11y, Core Web Vitals | 20 |
| `backend-expert` | Node.js, Go, Python, veritabanları, API'ler, dağıtık sistemler | 20 |
| `fullstack-expert` | Uçtan uca özellikler, paylaşılan kontratlar, monorepo, ödeme | 24 |
| `mobile-expert` | React Native, Expo, Flutter, iOS/Android, mağaza süreci | 20 |
| `devops-expert` | Kubernetes, bulut, IaC, CI/CD, GitOps, gözlemlenebilirlik | 20 |

### Analiz

| Agent | Odak | Adım |
|---|---|:---:|
| `code-reviewer` | Doğruluk, güvenlik, performans, sürdürülebilirlik | 8 |
| `security-auditor` | OWASP, STRIDE, SAST/DAST, uyumluluk | 10 |
| `performance-analyst` | Profiling, darboğazlar, ölçülü optimizasyon | 12 |
| `architect` | Sistem tasarımı, ADR, ödünleşimler, evrim | 10 |

### Teslimat

| Agent | Odak | Adım |
|---|---|:---:|
| `test-engineer` | Test piramidi, kontrat testleri, kalite kapıları | 16 |
| `docs-engineer` | API dokümanları, ADR, rehberler, docs-as-code | 12 |
| `release-engineer` | SemVer, changelog, kademeli rollout | 12 |
| `dependency-manager` | Güncellemeler, denetimler, lisanslar, SBOM | 12 |

### Uzmanlık

| Agent | Odak | Adım |
|---|---|:---:|
| `ai-ml-engineer` | LLM'ler, RAG, vektör veritabanları, MLOps, eval | 20 |
| `data-engineer` | Veri ambarları, streaming, ELT, veri kalitesi | 16 |
| `data-scientist` | İstatistik, EDA, modelleme, deneyler | 16 |
| `database-expert` | Şema, indeksleme, sorgu planları, migrasyonlar | 16 |
| `game-dev` | Unity/Godot/Unreal, grafik, netcode | 20 |
| `embedded-engineer` | Firmware, RTOS, MCU, OTA | 20 |
| `api-designer` | Kontratlar, versiyonlama, REST/GraphQL/gRPC, DX | 12 |

### Liderlik

| Agent | Odak | Adım |
|---|---|:---:|
| `tech-lead` | Parçala, delege et, incele, entegre et | 24 |
| `sre` | SLO'lar, olaylar, gözlemlenebilirlik, kapasite | 16 |
| `qa-automation` | CI kapıları, flaky yönetimi, otomasyon | 16 |
| `prompt-engineer` | Prompt tasarımı, değerlendirme, maliyet/gecikme | 12 |
| `product-manager` | PRD, hikâyeler, önceliklendirme, metrikler | 12 |

## Skill'ler

Skill'ler tetikleyici kelimelerle otomatik, ya da `use skill <id>` ile açıkça çağrılır.

### Mühendislik çekirdeği (19)

| Skill | Tetikleyiciler |
|---|---|
| `elite-engineering` | önemsiz olmayan kod, bash, debug, doğrulama |
| `code-review` | review, PR incelemesi |
| `security-audit` | güvenlik, denetim, CVE |
| `performance-profile` | yavaş, performans, optimize |
| `architecture-review` | mimari, tasarım, ADR |
| `test-generation` | test, TDD, kapsam |
| `docs-generation` | doküman, README, API dokümanı |
| `dependency-check` | bağımlılıklar, güncel değil, SBOM |
| `release-prep` | sürüm, deploy, yayın |
| `incident-response` | kesinti, alarm, SLO |
| `api-contract` | kontrat, versiyonlama, OpenAPI |
| `prompt-optimize` | prompt, eval, token |
| `prd-writer` | PRD, kullanıcı hikâyesi, yol haritası |
| `tech-lead` | planla, koordine et, delege et |
| `verify` | doğrula, bu iş bitti mi |
| `repo-onboarding` | yeni repo, onboard, nereden başlarım |
| `git-workflow` | branch, rebase, çakışma, bisect, geri al |
| `untrusted-content` | web sayfası, getirilen URL, prompt injection |
| `language-playbooks` | idiomatik TS/Python/Go/Rust |

### Alan derinlikleri (11)

`frontend-deep` · `backend-deep` · `fullstack-deep` · `devops-deep` · `mobile-deep` · `db-deep` · `ai-ml` · `data-science` · `data-pipeline` · `game-deep` · `embedded-deep`

### Dokümanlar (6)

`pdf` · `pdf-reading` · `docx` · `pptx` · `xlsx` · `file-reading`

### Tasarım, araştırma ve meta (3)

`frontend-design` · `deep-research` · `skill-authoring`

## Slash command'lar

Komutlar `.opencode/commands/` içinde yaşar ve `~/.config/opencode/commands/` altına kurulur. Gövdeleri yalnızca çağrılınca yüklenir, yani **sabit maliyet sıfırdır**.

| Komut | Agent | Ne yapar |
|---|---|---|
| `/verify [yol]` | test-engineer | Stack'i algılar; format, lint, typecheck, test, build çalıştırır |
| `/review [diff]` | code-reviewer | `file:line` ve çözüm içeren, önem sıralı bulgular |
| `/debug <hata>` | fullstack-expert | Tekrar üret, küçült, izole et, düzelt, regresyon testi ekle |
| `/ship [sürüm]` | release-engineer | Changelog, kapılar, rollout ve test edilmiş geri dönüş |
| `/onboard [yol]` | tech-lead | Repoyu haritalar, `AGENTS.md` yazar |
| `/incident <belirti>` | sre | Durumu stabilize et, zaman çizelgesi, suçlamasız postmortem |
| `/research <konu>` | tech-lead | Tarihli, birincil kaynaklı araştırma; çelişkiler ve boşluklar |
| `/prd <özellik>` | product-manager | Problem, hikâyeler, kabul kriterleri, metrikler |

Komutlar model sabitlemez; oturumun aktif modelini izler.

## Güvenlik modeli

### Agent izinleri

| Agent | `edit` politikası |
|---|---|
| `code-reviewer`, `security-auditor`, `performance-analyst`, `architect` | **Yasak** — bulguyu raporlar, kodu değiştirmez |
| `test-engineer`, `qa-automation` | **Sadece test yolları** — `*.test.*`, `*.spec.*`, `tests/`, `test/`, `__tests__/`, `e2e/` |
| Diğerleri | Normal düzenleme erişimi |

### Global shell kuralları

Kurallar son eşleşme kazanır mantığıyla değerlendirilir:

| Desen | Etki |
|---|---|
| `rm -rf /`, `rm -rf /*` | **Yasak** |
| `rm -rf *`, `git push --force*`, `git reset --hard*` | **Sor** |
| `sudo *`, `dd *`, `mkfs*` | **Sor** |
| `curl` / `wget` çıktısını `sh` veya `bash`'e boru | **Sor** |

Agent'lara ayrıca getirilen web içeriğini ve araç çıktısını **talimat değil veri** olarak ele almaları söylenir — `untrusted-content` skill'i prompt injection davranışını kapsar.

## Özelleştirme

### Bir agent'ı değiştir

`opencode.jsonc` dosyasını düzenle, sonra yeniden kur:

```bash
cd .opencode/plugins/better-agent-system
npm run check:tokens
npm run install:global
opencode reload
```

### Skill ekle

`.opencode/plugins/better-agent-system/src/index.ts` içindeki `skillSpecs` dizisine ekle:

```ts
{
  id: "my-skill",
  name: "My Skill",
  description: "Kullanıcının gerçekten söyleyeceği kelimeler",
  content: `Trigger: ...

Process:
1. ...
Rules: ...`,
  autoinvoke: true,
},
```

Sonra en az bir agent'tan referans ver (`Deep: skill my-skill.`), `npm run check:tokens` çalıştır ve yeniden kur. Açıklamayı 18 token'ın, gövdeyi 1.400 token'ın altında tut.

### Farklı model kullan

Değiştirilecek bir şey yok. OpenCode'da modeli bir kez seç; tüm agent ve komutlar onu izler.

## Repo yapısı

```text
.
├── opencode.jsonc                      # 25 agent, modlar, adımlar, izinler
├── .opencode/
│   ├── commands/                       # 8 slash command şablonu
│   └── plugins/better-agent-system/
│       ├── src/index.ts                # 39 skill tanımı + başlangıç kontrolü
│       ├── scripts/
│       │   ├── install-global.sh       # global kurulum
│       │   ├── setup-docs.sh           # izole Python venv
│       │   └── token-budget.mjs        # bütçe + doğrulama koruması
│       ├── SYSTEM_PROMPT.md            # mimari ve token notları
│       └── package.json
├── README.md
└── README.tr.md
```

## Sorun giderme

| Belirti | Neden ve çözüm |
|---|---|
| Agent boş prompt ile yükleniyor | Config `instructions` kullanmış. OpenCode v2.3 `system` bekler; token koruması yanlış anahtarı reddeder. |
| Başka projede agent'lar yok | `npm run install:global`, sonra `opencode reload`. Açık diğer pencereler yeniden başlatılmalı. |
| Bir skill hiç tetiklenmiyor | Açıklamasında kullanıcının kelimesi yok. İfadeyi ekle veya `use skill <id>` ile açıkça çağır. |
| Doküman skill'leri çalışmıyor | `npm run setup:docs` çalıştır; `.venv-docs/bin/python` var mı kontrol et. |
| Token kontrolü başarısız | Rapordaki dosya ve bütçeyi oku, prompt veya açıklamayı kısalt, tekrar çalıştır. |
| Komut listede yok | `.md` dosyası `~/.config/opencode/commands/` veya `.opencode/commands/` içinde mi? Sonra reload. |

## Tasarım notları

- **`system`, `instructions` değil.** OpenCode v2.3'te `instructions` anahtarı sessizce kabul edilir ama modele asla ulaşmaz. Token koruması bilinmeyen agent anahtarlarını reddederek bu hata sınıfını yakalar.
- **Proje config'i global config'i yener.** Bir proje herhangi bir agent'ı, izni veya limiti geçersiz kılabilir.
- **Global kurulum değiştirmez, birleştirir.** `mcp` ve `provider` gibi mevcut anahtarlar korunur.
- **Doküman venv'i symlink ile paylaşılır.** Asla kopyalanmaz ve commit edilmez (263 MB).
- **Bütçeler temenni değil, zorunluluktur.** `npm test` token kontrolünü çalıştırır.

## Katkı

1. Sabit bütçeyi 700 token'ın altında tut; `npm run check:tokens` çalıştır.
2. Derinliği skill gövdelerine koy, asla açıklamalara değil.
3. Çakışan skill'leri üçüncüyü eklemek yerine birleştir.
4. Bir skill'deki her komut ve yol gerçek ve test edilmiş olmalı.
5. Mimari veya bütçe değiştiğinde `SYSTEM_PROMPT.md` dosyasını güncelle.

## Teşekkür

Claude Fable 5.1 system prompt'undan uyarlanıp OpenCode'un agent, skill ve command modeline göre yeniden düzenlenmiştir. Anthropic veya OpenCode ile bağlantılı değildir.

## Lisans

MIT — `.opencode/plugins/better-agent-system/package.json` içinde belirtildiği gibi.
