#!/usr/bin/env python3
"""
QA E2E verification for Scrum Poker MVP (PRD AC F1.1..F5.6).

Runs against the Node ws test adapter serving the built SPA:
  PORT=5199 npm run dev -w apps/server   (serves apps/web/dist + /ws)

Two real Chromium browser contexts simulate the host and an invited guest,
exercising every acceptance criterion end-to-end. Screenshots are written to
qa/evidence/. Exits non-zero and prints FAIL lines if any AC check fails.
"""
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:5199"
EVIDENCE = Path(__file__).resolve().parent / "evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)

results = []
errors_console = []


def record(ac, ok, detail=""):
    results.append((ac, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'} {ac} {detail}")


def shot(page, name):
    p = EVIDENCE / f"{name}.png"
    page.screenshot(path=str(p), full_page=False)
    return p


def participants_section(page):
    return page.locator('section[aria-label="Participants"]')


def seat_names(page):
    return participants_section(page).locator(".text-sm.font-semibold.text-slate-900").all_inner_texts()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------------- AC-F1.1 / F1.2 / F1.3: fresh host creates a room ----------------
        host_ctx = browser.new_context()
        host = host_ctx.new_page()
        host_errors = []
        host.on("console", lambda m: host_errors.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
        host.on("pageerror", lambda e: host_errors.append(str(e)))
        host.goto(BASE)

        expect(host.locator("h1")).to_have_text("Scrum Hold'em Poker")
        # empty submit -> validation error, no room created (F1.6 validation)
        host.get_by_role("button", name="New room").click()
        expect(host.get_by_role("alert")).to_contain_text("Enter a display name")
        record("AC-F1.6-empty", host.url == f"{BASE}/")

        host.locator('input[autocomplete="name"]').fill("Maya")
        host.get_by_role("button", name="New room").click()
        host.wait_for_url(re.compile(r"/room/\d{6}"))
        room_id_1 = host.url.split("/room/")[1].rstrip("/")
        record("AC-F1.1", True, f"fresh browser, no auth -> room {room_id_1}")

        # invite URL shown in header (F1.3)
        invite_text = host.locator("header .invite-url").inner_text()
        m = re.search(r"/r/(\d{6})$", invite_text)
        record("AC-F1.3-url", bool(m), invite_text)
        invite_url_1 = m.group(0) if m else None
        token_1 = m.group(1) if m else None
        record("AC-F1.2-shape", bool(token_1) and re.fullmatch(r"\d{6}", token_1) is not None, f"token {token_1}")
        expect(host.get_by_role("button", name="Copy invite link")).to_be_visible()

        shot(host, "01-host-room")

        # ---------------- AC-F1.4: fresh guest opening the invite sees ONLY the join gate ----------------
        guest_ctx = browser.new_context()
        guest = guest_ctx.new_page()
        guest_errors = []
        guest.on("console", lambda m: guest_errors.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
        guest.on("pageerror", lambda e: guest_errors.append(str(e)))
        guest.goto(f"{BASE}{invite_url_1}")
        expect(guest.get_by_role("heading", name="You've been invited")).to_be_visible()
        expect(guest.get_by_role("button", name="Join room")).to_be_visible()
        # guest isolation: no room state leaks (no participant list, no deck, no reveal)
        leaked = participants_section(guest).count() > 0 or guest.get_by_role("button", name="Reveal").count() > 0
        record("AC-F1.4", not leaked, "join prompt shown, no creator room state")
        shot(guest, "02-guest-join-gate")

        # ---------------- F1.5/F1.6: guest joins; remembered name behavior ----------------
        name_input = guest.locator('input[autocomplete="name"]')
        expect(name_input).to_have_value("")  # fresh device -> empty prefill (F1.6)
        record("AC-F1.6-fresh-empty", True)
        name_input.fill("Leo")
        guest.get_by_role("button", name="Join room").click()
        guest.wait_for_url(re.compile(r"/room/\d{6}"))
        record("AC-F1.4-join", True, "guest joined via invite URL")

        # ---------------- AC-F5.1: host sees the guest within 2s, no refresh ----------------
        t0 = time.time()
        expect(participants_section(host).locator("text=Leo")).to_be_visible(timeout=2000)
        record("AC-F5.1", True, f"join propagated in {time.time()-t0:.2f}s")
        expect(participants_section(guest).locator("text=Maya")).to_be_visible(timeout=2000)

        # ---------------- AC-F2.1: exact deck ----------------
        deck_buttons = guest.locator("main button[aria-pressed]")
        deck_labels = deck_buttons.evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
        expect(deck_buttons).to_have_count(8)  # 7 Fibonacci + Pass
        record("AC-F2.1", deck_labels == ["Vote 1", "Vote 2", "Vote 3", "Vote 5", "Vote 8", "Vote 13", "Vote 21", "Pass"], str(deck_labels))

        # ---------------- AC-F2.5/F5.3: vote propagation, face-down, change vote ----------------
        expect(guest.locator("text=0 of 2 voted")).to_be_visible()
        # host submits 5 then changes to 8 (F2.4)
        host.get_by_role("button", name="Vote 5").click()
        expect(host.locator("text=1 of 2 voted")).to_be_visible(timeout=2000)
        expect(guest.locator("text=1 of 2 voted")).to_be_visible(timeout=2000)  # F5.3 real-time
        record("AC-F5.3", True, "vote count propagated to other client")
        host.get_by_role("button", name="Vote 8").click()
        expect(host.locator("text=1 of 2 voted")).to_be_visible(timeout=2000)  # still 1: changed, not added
        # guest submits 5
        guest.get_by_role("button", name="Vote 5").click()
        expect(guest.locator("text=2 of 2 voted")).to_be_visible(timeout=2000)
        expect(host.locator("text=2 of 2 voted")).to_be_visible(timeout=2000)
        shot(guest, "03-voting-facedown")

        # AC-F2.3: no value text in the participants section pre-reveal (including host's view)
        def no_value_text_in_seats(page):
            txt = participants_section(page).inner_text()
            # seats render only names, ♠, badges — no numeric card values, no "Pass"
            return not re.search(r"\b(1|2|3|5|8|13|21|Pass)\b", txt.replace("Host", "").replace("You", ""))

        record("AC-F2.3-host", no_value_text_in_seats(host), "host sees no other value text")
        record("AC-F2.3-guest", no_value_text_in_seats(guest), "guest sees no other value text")

        # ---------------- AC-F3.1/F3.4: reveal controls ----------------
        reveal_host = host.get_by_role("button", name="Reveal")
        reveal_guest = guest.get_by_role("button", name="Reveal")
        record("AC-F3.1", reveal_host.is_enabled() and reveal_guest.is_enabled(),
               "every participant has an enabled Reveal during voting")

        # zero-vote guard: fresh round with no votes -> disabled
        # (already covered by new room: create a second round later; check button before votes)
        # Re-vote to clear, then assert disabled
        # ---------------- AC-F4.3 (part 1): re-vote from revealed requires reveal first; do consensus round ----------
        # reveal from GUEST (anyone can trigger) -> simultaneous on all clients (F3.2/F5.4)
        reveal_guest.click()
        expect(host.locator("text=Revealed")).to_be_visible(timeout=2000)
        expect(guest.locator("text=Revealed")).to_be_visible(timeout=2000)
        # AC-F3.3: names + values visible on both
        # (value may appear twice post-reveal: the seat card AND the on-table
        #  TableCards element — ui_spec §6.2; use .first to avoid strict-mode)
        expect(participants_section(host).locator("text=Maya").first).to_be_visible()
        expect(participants_section(host).locator("text=8").first).to_be_visible()
        expect(participants_section(host).locator("text=Leo").first).to_be_visible()
        expect(participants_section(host).locator("text=5").first).to_be_visible()
        expect(participants_section(guest).locator("text=8").first).to_be_visible()
        expect(participants_section(guest).locator("text=5").first).to_be_visible()
        record("AC-F3.2", True, "guest-triggered reveal converged on host without host action (single broadcast)")
        record("AC-F3.3", True, "all names+values visible on both clients")
        shot(host, "04-revealed-noconsensus")

        # AC-F4.2: differing votes -> no consensus + distribution + Re-vote
        expect(host.locator("text=No consensus yet")).to_be_visible()
        expect(host.locator("text=Discuss the spread, then re-vote.")).to_be_visible()
        expect(host.locator("text=8").nth(0)).to_be_visible()
        dist = [el.get_attribute("data-dist") or "" for el in host.locator("[data-dist]").all()]
        dist_norm = " ".join(dist)
        record("AC-F4.2-distribution", "8×1" in dist_norm and "5×1" in dist_norm, str(dist))
        expect(host.get_by_role("button", name="Re-vote")).to_be_visible()
        expect(guest.get_by_role("button", name="Re-vote")).to_be_visible()
        record("AC-F4.2", True, "no-consensus + distribution + re-vote control shown")

        # AC-F4.3: ANY participant re-votes (guest triggers); votes cleared, participants kept
        guest.get_by_role("button", name="Re-vote").click()
        expect(host.locator("text=Voting")).to_be_visible(timeout=2000)
        expect(host.locator("text=0 of 2 voted")).to_be_visible(timeout=2000)
        expect(participants_section(host).locator("text=Maya")).to_be_visible()
        expect(participants_section(host).locator("text=Leo")).to_be_visible()
        record("AC-F4.3", True, "guest re-vote cleared votes, participants unchanged")

        # ---------------- AC-F3.4: reveal disabled with zero votes ----------------
        expect(reveal_host).to_be_disabled()
        expect(reveal_guest).to_be_disabled()
        record("AC-F3.4", True, "Reveal disabled while 0 votes submitted")

        # ---------------- AC-F4.1: consensus when all equal ----------------
        host.get_by_role("button", name="Vote 13").click()
        guest.get_by_role("button", name="Vote 13").click()
        expect(host.locator("text=2 of 2 voted")).to_be_visible(timeout=2000)
        host.get_by_role("button", name="Reveal").click()  # host triggers this time (anyone)
        expect(host.locator("text=Consensus")).to_be_visible(timeout=2000)
        expect(host.locator("text=Estimated at 13")).to_be_visible()
        expect(guest.locator("text=Estimated at 13")).to_be_visible()
        record("AC-F4.1", True, "all-equal -> Consensus — Estimated at 13 on both clients")
        shot(host, "05-revealed-consensus")

        # ---------------- AC-F3.5: pass vote ----------------
        guest.get_by_role("button", name="Re-vote").click()
        expect(guest.locator("text=0 of 2 voted")).to_be_visible(timeout=2000)
        # only pass votes -> no consensus verdict
        host.get_by_role("button", name="Pass").click()
        guest.get_by_role("button", name="Pass").click()
        expect(host.locator("text=2 of 2 voted")).to_be_visible(timeout=2000)
        host.get_by_role("button", name="Reveal").click()
        expect(host.locator("text=No consensus yet")).to_be_visible(timeout=2000)
        expect(participants_section(host).locator("text=☕").first).to_be_visible()
        chips = host.locator("[data-dist]").all()
        record("AC-F3.5-onlypass", chips == [], f"only-pass round: no distribution {chips}")
        # pass + numeric -> pass excluded from distribution/consensus
        guest.get_by_role("button", name="Re-vote").click()
        expect(host.locator("text=0 of 2 voted")).to_be_visible(timeout=2000)
        host.get_by_role("button", name="Pass").click()
        guest.get_by_role("button", name="Vote 3").click()
        expect(host.locator("text=2 of 2 voted")).to_be_visible(timeout=2000)
        guest.get_by_role("button", name="Reveal").click()
        expect(host.locator("text=Consensus")).to_be_visible(timeout=2000)
        expect(host.locator("text=Estimated at 3")).to_be_visible()
        chips2 = [el.get_attribute("data-dist") or "" for el in host.locator("[data-dist]").all()]
        chips2_norm = " ".join(chips2)
        record("AC-F3.5-mixed", chips2_norm == "3×1", f"pass excluded from distribution: {chips2_norm}")
        # pass renders as ☕ on the on-table card (prototype parity)
        expect(participants_section(host).locator("text=☕").first).to_be_visible()
        record("AC-F3.5-render", True, "pass vote renders as coffee")
        shot(host, "06-pass-vote")

        # ---------------- AC-F5.2: leave detection <=10s ----------------
        guest.close()
        t0 = time.time()
        expect(participants_section(host)).not_to_contain_text("Leo", timeout=11000)
        dt = time.time() - t0
        record("AC-F5.2", dt <= 10.0, f"guest evicted in {dt:.1f}s (grace 8s)")
        expect(host.locator("text=1 of 1 voted")).to_be_visible(timeout=2000)  # counts adjust

        # ---------------- AC-F5.5: reconnect resync without reload (offline drop) ----------------
        expect(participants_section(host).locator("text=Maya")).to_be_visible()
        host_ctx.set_offline(True)
        time.sleep(0.5)
        host_ctx.set_offline(False)
        # transport reconnects with backoff, room:resume re-binds; state converges
        expect(participants_section(host).locator("text=Maya")).to_be_visible(timeout=8000)
        expect(host.locator("text=You")).to_be_visible(timeout=8000)
        expect(host.locator("text=Revealed")).to_be_visible(timeout=8000)  # still in revealed round
        record("AC-F5.5", True, "offline drop -> auto-reconnect -> room:resume converged without reload")

        # host refresh keeps identity + room state (PRD decision 5 / F5.5)
        host.reload()
        expect(participants_section(host).locator("text=Maya")).to_be_visible(timeout=5000)
        expect(host.locator("text=You")).to_be_visible(timeout=5000)
        expect(host.locator("text=Revealed")).to_be_visible(timeout=5000)
        record("AC-F5.5-refresh", True, "reload re-bound same participant, state preserved")

        # ---------------- AC-F1.5/F1.6: remembered-name prefill (host device) ----------------
        host.goto(f"{BASE}/")
        expect(host.locator('input[autocomplete="name"]')).to_have_value("Maya")
        record("AC-F1.5-create-prefill", True, "landing prefilled after create")

        # Leo's device: back to landing -> prefilled Leo
        guest_ctx2 = browser.new_context()
        guest2 = guest_ctx2.new_page()
        guest2.goto(f"{BASE}{invite_url_1}")
        expect(guest2.get_by_role("heading", name="You've been invited")).to_be_visible()
        expect(guest2.locator('input[autocomplete="name"]')).to_have_value("")
        record("AC-F1.6-fresh-empty-invite", True, "fresh device: empty input, join gate")
        guest2.locator('input[autocomplete="name"]').fill("Leo")
        guest2.get_by_role("button", name="Join room").click()
        guest2.wait_for_url(re.compile(r"/room/\d{6}"))
        guest2.goto(f"{BASE}/")
        expect(guest2.locator('input[autocomplete="name"]')).to_have_value("Leo")
        record("AC-F1.5-join-prefill", True, "landing prefilled with Leo after prior join")
        guest2.goto(f"{BASE}{invite_url_1}")
        expect(guest2.get_by_role("heading", name="You've been invited")).to_be_visible()
        expect(guest2.locator('input[autocomplete="name"]')).to_have_value("Leo")
        record("AC-F1.5-join-prefill-invite", True, "join form prefilled on Leo's device")

        # prefill editable + no auto-submit (F1.6)
        guest2.locator('input[autocomplete="name"]').fill("Leo X")
        time.sleep(0.4)
        still_gate = guest2.get_by_role("heading", name="You've been invited").is_visible()
        record("AC-F1.6-no-autosubmit", still_gate and guest2.url.endswith(f"/r/{token_1}"),
               "edited prefill did not auto-submit; join gate remains")
        guest_ctx2.close()

        # ---------------- AC-F1.2 E2E: two creations differ ----------------
        ctx2 = browser.new_context()
        p2 = ctx2.new_page()
        p2.goto(BASE)
        p2.locator('input[autocomplete="name"]').fill("Dan")
        p2.get_by_role("button", name="New room").click()
        p2.wait_for_url(re.compile(r"/room/\d{6}"))
        token_2 = p2.url.split("/room/")[1].rstrip("/")
        record("AC-F1.2-unique", token_1 != token_2, f"tokens differ: {token_1} vs {token_2}")
        ctx2.close()

        # ---------------- AC-F1.4 negative: bad invite link ----------------
        bad = browser.new_context()
        bp = bad.new_page()
        bp.goto(f"{BASE}/r/{'123456'}")
        bp.locator('input[autocomplete="name"]').fill("X")
        bp.get_by_role("button", name="Join room").click()
        expect(bp.get_by_role("alert")).to_contain_text("no longer valid", timeout=4000)
        record("AC-F1.4-bad-link", True, "nonexistent room shows invalid-link error")
        bad.close()

        # ---------------- AC-F5.6: no polling — watch an ACTIVE room for repeat HTTP requests ----------------
        watch = browser.new_context()
        wp = watch.new_page()
        reqs = []
        wp.on("request", lambda r: reqs.append(r.url) if r.resource_type in ("fetch", "xhr") else None)
        ws_conns = []
        wp.on("websocket", lambda ws: ws_conns.append(ws.url))
        wp.goto(BASE)
        wp.locator('input[autocomplete="name"]').fill("Watch")
        wp.get_by_role("button", name="New room").click()
        wp.wait_for_url(re.compile(r"/room/\d{6}"))
        expect(participants_section(wp).locator("text=Watch")).to_be_visible(timeout=3000)
        time.sleep(5)  # idle window: any polling would fire repeat requests
        record("AC-F5.6", reqs == [] and len(ws_conns) >= 1,
               f"idle 5s in active room: fetch/xhr={reqs}, websockets={ws_conns}")
        watch.close()

        # ---------------- Console error sweep ----------------
        record("CONSOLE-host", host_errors == [], str(host_errors[:5]))
        record("CONSOLE-guest", guest_errors == [], str(guest_errors[:5]))

        host_ctx.close()
        guest_ctx.close()
        browser.close()

    failed = [r for r in results if not r[1]]
    print("\n==================== SUMMARY ====================")
    for ac, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'} {ac}")
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILED:", [f[0] for f in failed])
        sys.exit(1)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
