# No Menu Tap List — App Store Connect MVP checklist

> **Current live release:** `1.3.2` build `48` was approved and confirmed available on the App Store on 2026-09-03 — use [APP_STORE_CONNECT_1.3.2.md](./APP_STORE_CONNECT_1.3.2.md). This file is the generic preflight checklist.

Use this before uploading a **production** iOS build. Demo seed data (`taplist-demo-*` bars) is acceptable for TestFlight; replace with real bars before public App Store release if desired.

## 1. What is the first-launch gate?

A **blocking screen on the first app open** where the user confirms legal drinking age, reviews legal links, and chooses whether to enable optional anonymous analytics. It is stored in AsyncStorage (`@taplist/first_launch_consent_v2`) so it does not repeat every session.

Implemented in: `components/taplist/FirstLaunchLegalGate.tsx` (ADR-018).

## 2. Automated checks (run locally)

```bash
cd taplist-mobile
npm install
npx tsc --noEmit
npx expo export --platform web
```

Both must pass before `eas build`.

## 3. Environment for production builds

In EAS **production** secrets (Expo dashboard — not `eas.json`), set **HTTPS** Supabase only:

| Variable | Required |
|----------|----------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon / publishable key |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | `https://nomenuapp.com/privacy` |

Do **not** ship production builds with `http://127.0.0.1:54321`.

See also **[TESTFLIGHT.md](./TESTFLIGHT.md)** for the full release checklist.

## 4. App Store Connect — app information

| Field | Value |
|-------|--------|
| **Bundle ID** | `com.nomenuapp.taplist` |
| **SKU** | `nomenuapp-ios-v1` |
| **ASC app ID** (`ascAppId`) | `6771324382` |
| **Name** | No Menu Tap List (or your ASC display name) |
| **Subtitle** | 城市精酿酒吧公开酒单 |
| **Category** | Food & Drink (primary) |
| **Age rating** | Answer alcohol references as **Frequent**; App Store Connect calculates **18+** on the new system and **17+** on older OS versions |
| **Privacy Policy URL** | `https://nomenuapp.com/privacy` |

### App Review notes (paste into Review Information)

```
This app is a read-only directory of public craft beer tap lists for bars in supported cities.
It does not sell alcohol, accept payments, or facilitate delivery.
Users browse bar menus and beer information only.
Alcohol-related content is informational; a first-launch age confirmation is required.
```

English disclaimer for reviewers: see `TAPLIST_LEGAL_DISCLAIMER_EN` in `constants/compliance.ts`.

### App Store copy for 1.3.0

**Promotional Text / 推广文本**

```text
No Menu 现在支持多城市。切换城市，查看当地公开精酿酒吧、实时酒单、近期活动与新上酒款。
```

**Description / 描述**

```text
No Menu 是一个精简的精酿酒吧实时酒单应用。

你可以按城市查看合作酒吧公开的生啤酒单、近期活动、上新酒款与杯型价格，快速判断今晚去哪喝、喝什么。

No Menu 不提供下单、支付、配送、预约或评分功能。所有酒单信息来自合作酒吧自愿公开的数据；实际供应、价格与营业状态请以门店现场为准。
```

**What’s New / 此版本的新增内容**

```text
1. 新增多城市支持：可在首页切换城市，查看当地公开酒吧酒单。
2. 首页、搜索、活动与上新酒款会随所选城市自动更新。
3. 城市选择会保存在本机，下次打开继续使用。
4. 优化城市与门店数据管理，提升多城市上线稳定性。
```

## 5. Privacy questionnaire

The current build includes optional PostHog product analytics. Use the release-specific answers in [APP_STORE_CONNECT_1.2.3.md](./APP_STORE_CONNECT_1.2.3.md#5-app-privacy-建议填写); do not use the older “no data collected” answer.

## 6. Screenshots & metadata

Use `tools/app-store-screenshots.html` to generate Chinese App Store Connect screenshots.
It defaults to the current 6.9" iPhone portrait size and also supports an alternate 6.9" size plus 6.5" exports.

Prepare the highest-resolution 6.9" iPhone screenshots first. If the UI is identical across device sizes, App Store Connect can scale them automatically; add alternate 6.9" or 6.5" exports only when you need a different composition. Show:

1. Multi-city Tonight feed with city label  
2. City picker or a second city feed  
3. Bar tap list  
4. Beer detail + serving options  
5. Search results  
6. Events, if real public events are available  

## 7. Build & submit (EAS)

```bash
npm i -g eas-cli
eas login
cd taplist-mobile
# Set production env in Expo dashboard, then:
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

`ascAppId` is set in `eas.json`. Add `appleId` (Apple ID email) and `appleTeamId` when running submit, or in `eas.json`.

## 8. Current scope reminders

No general map, background or automatic GPS, ordering, payments, delivery, reservations, ratings, or social features. The approved exceptions are user-triggered iOS foreground-location sorting, private anonymous/Apple-protected TAP records, private bar follows, and optional new-tap push (see `AGENTS.md`).

## 9. Pre-submission manual smoke (5 min)

- [ ] First launch shows age gate; tap continue → Tonight  
- [ ] Kill app, reopen → gate does **not** show again  
- [ ] Tonight lists bars for the default city  
- [ ] City picker appears when 2+ public cities exist  
- [ ] Switch city → Tonight, Search, 最近上新, and 活动 use the selected city
- [ ] Kill app, reopen → selected city is restored  
- [ ] Tap 附近 → purpose sheet precedes iOS permission; allow, deny, and failure all behave correctly
- [ ] Swipe the homepage activity banner → one complete banner per page and page dots update correctly
- [ ] Open 活动 → Chinese groups, dates, event detail, full-poster viewer, and participating-bar link work
- [ ] Open bar → drinks load  
- [ ] Download bar tap list → preview shows all drinks; public prices are complete and private prices are absent
- [ ] Open beer → servings + disclaimer  
- [ ] Search “IPA” → drink results  
- [ ] About shows disclaimer (+ privacy link if URL configured)  
- [ ] Airplane mode → clear empty states, no crash  

## 10. Status

| Item | Status |
|------|--------|
| Typecheck | Passed for live `1.3.2` build `48` |
| Web export | Passed for live `1.3.2` build `48` |
| First-launch gate | Implemented |
| Compliance on About / bar / beer | Implemented |
| `ITSAppUsesNonExemptEncryption: false` | In `app.json` |
| Privacy policy URL | https://nomenuapp.com/privacy (set in EAS secrets) |
| EAS production build | `1.3.2` build `48` completed |
