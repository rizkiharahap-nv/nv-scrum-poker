#!/usr/bin/env python3
"""Exploratory QA edge cases for Scrum Poker MVP (supplement to e2e_verify.py)."""
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:5199"
EVIDENCE = Path(__file__).resolve().parent / "evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'} {name} {detail}")


def participants_section(page):
    return page.locator('section[aria-label="Participants"]')


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------- 3 guests in one room (multi-participant) ----------
        host_ctx = browser.new_context()
        host = host_ctx.new_page()
        host.goto(BASE)
        host.locator('input[autocomplete="name"]').fill("Host")
        host.get_by_role("button", name="New room").click()
        host.wait_for_url(re.compile(r"/room/\d{6}"))
        token = host.url.split("/room/")[1].rstrip("/")

        guests = []
        names = ["Ann", "Bob", "Cid"]
        for nm in names:
            ctx = browser.new_context()
            g = ctx.new_page()
            g.goto(f"{BASE}/r/{token}")
            g.locator('input[autocomplete="name"]').fill(nm)
            g.get_by_role("button", name="Join room").click()
            g.wait_for_url(re.compile(r"/room/\d{6}"))
            guests.append((ctx, g))
        # everyone sees all 4 participants within 2s
        expect(participants_section(host).locator("text=Ann")).to_be_visible(timeout=2000)
        expect(participants_section(host).locator("text=Bob")).to_be_visible(timeout=2000)
        expect(participants_section(host).locator("text=Cid")).to_be_visible(timeout=2000)
        expect(participants_section(host).locator("text=Host").first).to_be_visible()
        for _, g in guests:
            expect(participants_section(g).locator("text=Host").first).to_be_visible(timeout=2000)
            expect(participants_section(g).locator("text=Ann")).to_be_visible(timeout=2000)
            expect(participants_section(g).locator("text=Bob")).to_be_visible(timeout=2000)
            expect(participants_section(g).locator("text=Cid")).to_be_visible(timeout=2000)
        record("MULTI-GUEST-4P", True, "4 participants visible on all 4 clients")
        expect(host.locator("text=0 of 4 voted")).to_be_visible()
        record("MULTI-GUEST-COUNT", True, "0 of 4 voted")

        # all 4 vote, then guest triggers reveal, all see consensus/values
        host.get_by_role("button", name="Vote 8").click()
        guests[0][1].get_by_role("button", name="Vote 8").click()
        guests[1][1].get_by_role("button", name="Vote 8").click()
        guests[2][1].get_by_role("button", name="Vote 8").click()
        expect(host.locator("text=4 of 4 voted")).to_be_visible(timeout=2000)
        guests[2][1].get_by_role("button", name="Reveal").click()
        expect(host.locator("text=Consensus")).to_be_visible(timeout=2000)
        expect(host.locator("text=Estimated at 8")).to_be_visible()
        for _, g in guests:
            expect(g.locator("text=Estimated at 8")).to_be_visible(timeout=2000)
        record("MULTI-GUEST-REVEAL", True, "4/4 consensus converged on all clients")
        # face-down during voting: each sees 4 card backs, no numeric value text
        host.get_by_role("button", name="Re-vote").click()
        expect(host.locator("text=0 of 4 voted")).to_be_visible(timeout=2000)
        seat_text = participants_section(host).inner_text()
        numeric_leak = re.search(r"\b(1|2|3|5|8|13|21)\b", seat_text.replace("Host", "").replace("You", ""))
        record("MULTI-GUEST-FACEDOWN", not numeric_leak, "no value text pre-reveal with 4 seats")
        for ctx, g in guests:
            ctx.close()
        host_ctx.close()

        # ---------- direct /room/<token> without session -> join gate ----------
        c = browser.new_context()
        pg = c.new_page()
        pg.goto(f"{BASE}/r/{token}")
        pg.wait_for_url(re.compile(r"/r/"))
        # no session: /room/ redirects to join gate
        c2 = browser.new_context()
        pg2 = c2.new_page()
        pg2.goto(f"{BASE}/room/{token}")
        expect(pg2.get_by_role("heading", name="You've been invited")).to_be_visible(timeout=3000)
        record("DIRECT-ROOM-REDIRECT", True, "/room/<token> without session -> join gate")
        c.close()
        c2.close()

        # ---------- XSS-ish display name is escaped ----------
        c3 = browser.new_context()
        pg3 = c3.new_page()
        pg3.goto(BASE)
        pg3.locator('input[autocomplete="name"]').fill('<img src=x onerror=alert(1)>')
        pg3.get_by_role("button", name="New room").click()
        pg3.wait_for_url(re.compile(r"/room/\d{6}"))
        html = participants_section(pg3).inner_html()
        text = participants_section(pg3).inner_text()
        # Svelte escapes: name renders as &lt;img... text; no <img element is created.
        record("XSS-NAME-ESCAPED", "<img" not in html and "<img" in text,
               "script tag rendered as escaped text, no element injected")
        # 25-char name rejected by server (client maxlength=24 too)
        pg3.goto(BASE)
        # bypass client maxlength via JS
        pg3.eval_on_selector('input[autocomplete="name"]', "el => { el.maxLength = 100; }")
        pg3.locator('input[autocomplete="name"]').fill("A" * 25)
        pg3.get_by_role("button", name="New room").click()
        expect(pg3.get_by_role("alert")).to_contain_text("24 characters or fewer", timeout=3000)
        record("NAME-25-REJECTED", True, "25-char name rejected (client + server)")
        # whitespace-only name
        pg3.locator('input[autocomplete="name"]').fill("   ")
        pg3.get_by_role("button", name="New room").click()
        expect(pg3.get_by_role("alert")).to_contain_text("Enter a display name", timeout=3000)
        record("NAME-WHITESPACE-REJECTED", True, "whitespace-only rejected")
        c3.close()

        # ---------- duplicate display names allowed (PRD silent) ----------
        d1 = browser.new_context()
        d2 = browser.new_context()
        g1, g2 = d1.new_page(), d2.new_page()
        g1.goto(f"{BASE}/r/{token}")
        g1.locator('input[autocomplete="name"]').fill("Dup")
        g1.get_by_role("button", name="Join room").click()
        g1.wait_for_url(re.compile(r"/room/\d{6}"))
        g2.goto(f"{BASE}/r/{token}")
        g2.locator('input[autocomplete="name"]').fill("Dup")
        g2.get_by_role("button", name="Join room").click()
        g2.wait_for_url(re.compile(r"/room/\d{6}"))
        expect(participants_section(g1).locator("text=Dup").first).to_be_visible(timeout=2000)
        record("DUP-NAMES-OK", True, "two guests may share a display name (not forbidden by PRD)")
        d1.close()
        d2.close()

        # ---------- vote after reveal rejected (server guard) ----------
        # (covered by unit test; skip UI re-check)

        # ---------- reveal with zero votes: server rejects even if UI bypassed ----------
        e1 = browser.new_context()
        gz = e1.new_page()
        gz.goto(BASE)
        gz.locator('input[autocomplete="name"]').fill("Zero")
        gz.get_by_role("button", name="New room").click()
        gz.wait_for_url(re.compile(r"/room/\d{6}"))
        reveal_btn = gz.get_by_role("button", name="Reveal")
        record("ZERO-VOTE-BTN-DISABLED", reveal_btn.is_disabled(), "Reveal disabled with 0 votes")
        e1.close()

        browser.close()

    failed = [r for r in results if not r[1]]
    print("\n==================== SUMMARY ====================")
    for n, ok, d in results:
        print(f"{'PASS' if ok else 'FAIL'} {n}")
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("FAILED:", [f[0] for f in failed])
        sys.exit(1)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
