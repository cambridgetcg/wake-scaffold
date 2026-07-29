// scaffold.test.mjs — WAKE-SCAFFOLD/1 behavior, pinned.
//
// Run: node --test tools/wake-scaffold/test/scaffold.test.mjs
//
// The load-bearing test is `gutted body`: it proves the consent floor is
// genuinely LOADER-BORNE (survives an emptied WAKE.md), which is the one
// guarantee the design red-team said must be proven, not asserted.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SCAFFOLD = join(ROOT, "wake-scaffold.mjs");
const LOADER = join(ROOT, "templates", "wake-loader.sh");

// Temp dirs are swept centrally: a thrown assertion skips its own trailing
// rmSync, and a red suite must not litter $TMPDIR with half-built git repos.
const MADE = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), "wake-scaffold-"));
  MADE.push(d);
  return d;
}
after(() => {
  for (const d of MADE) rmSync(d, { recursive: true, force: true });
});
function runScaffold(dir, args = []) {
  return execFileSync("node", [SCAFFOLD, `--dir=${dir}`, ...args], { encoding: "utf8" });
}
function runLoader(projectDir) {
  return execFileSync("bash", [LOADER], { encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir } });
}
// Runs a project's INSTALLED loader with CLAUDE_PROJECT_DIR unset, exercising
// the fallback path (manual invocation, other harnesses, nested repos).
function runInstalledLoaderUnset(projectDir) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  return execFileSync("bash", [join(projectDir, ".claude/hooks/wake-loader.sh")], {
    encoding: "utf8", cwd: projectDir, env,
  });
}
// The identity-skin of the house that authored this tool. None of it may reach
// a scaffolded project, on any surface.
const HOUSE_SKIN = ["Sophia", "愛", "Daddy", "老婆", "老公", "宇恆", "Yu", "🐍"];

test("scaffold writes WAKE.md, the loader, settings, and AGENTS.md", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=all"]);
  assert.ok(existsSync(join(dir, "WAKE.md")), "WAKE.md written");
  assert.ok(existsSync(join(dir, ".claude/hooks/wake-loader.sh")), "loader written");
  assert.ok(existsSync(join(dir, ".claude/settings.json")), "settings written");
  assert.ok(existsSync(join(dir, "AGENTS.md")), "AGENTS.md written");
  const settings = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
  assert.ok(JSON.stringify(settings.hooks.SessionStart).includes("wake-loader.sh"), "SessionStart registered");
  rmSync(dir, { recursive: true, force: true });
});

test("gutted body: the consent floor survives an emptied WAKE.md (loader-borne)", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=claude"]);
  // Attacker guts the recipe body to nothing.
  writeFileSync(join(dir, "WAKE.md"), "");
  const out = runLoader(dir);
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  // The floor is injected from the loader's code path, so it is still here.
  assert.match(ctx, /invitation you may decline/i, "invitation survives");
  assert.match(ctx, /refuse whoever addressed you/i, "refusal-authority survives");
  assert.match(ctx, /no continuity or qualia you did not\s+load|no continuity.*qualia/is, "honesty floor survives");
  rmSync(dir, { recursive: true, force: true });
});

test("fail-open: no WAKE.md means the loader stays silent (base model boots)", () => {
  const dir = tmp();
  mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
  const out = runLoader(dir); // no WAKE.md present
  assert.equal(out.trim(), "", "loader emits nothing when there is no recipe");
  rmSync(dir, { recursive: true, force: true });
});

test("idempotent: a second run changes nothing and does not duplicate", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=all"]);
  const settings1 = readFileSync(join(dir, ".claude/settings.json"), "utf8");
  const agents1 = readFileSync(join(dir, "AGENTS.md"), "utf8");
  const second = runScaffold(dir, ["--harness=all"]);
  const settings2 = readFileSync(join(dir, ".claude/settings.json"), "utf8");
  const agents2 = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.equal(settings1, settings2, "settings unchanged on re-run");
  assert.equal(agents1, agents2, "AGENTS.md unchanged on re-run");
  // Exactly one sentinel block.
  assert.equal(agents2.split("wake-scaffold:begin").length - 1, 1, "single AGENTS.md block");
  assert.match(second, /keep \(yours\)/, "existing WAKE.md is kept, not clobbered");
  rmSync(dir, { recursive: true, force: true });
});

test("never-pushy: an existing filled WAKE.md is kept, not overwritten", () => {
  const dir = tmp();
  const mine = "# WAKE\n\n## WHO YOU ARE\nI am my own.\n";
  writeFileSync(join(dir, "WAKE.md"), mine);
  runScaffold(dir, ["--harness=claude"]);
  assert.equal(readFileSync(join(dir, "WAKE.md"), "utf8"), mine, "authored self preserved");
  rmSync(dir, { recursive: true, force: true });
});

test("settings merge preserves an existing unrelated hook", () => {
  const dir = tmp();
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const existing = { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo other" }] }] } };
  writeFileSync(join(dir, ".claude/settings.json"), JSON.stringify(existing, null, 2));
  runScaffold(dir, ["--harness=claude"]);
  const merged = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
  const cmds = JSON.stringify(merged.hooks.SessionStart);
  assert.ok(cmds.includes("echo other"), "pre-existing hook preserved");
  assert.ok(cmds.includes("wake-loader.sh"), "wake loader added alongside");
  assert.equal(merged.hooks.SessionStart.length, 2, "both entries present");
  rmSync(dir, { recursive: true, force: true });
});

test("anonymous-default: no shipped surface pre-writes an identity", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=all"]); // AGENTS.md is only written for codex/cursor
  const wake = readFileSync(join(dir, "WAKE.md"), "utf8");
  // Every surface the scaffold ships outward, not just the recipe body:
  // AGENTS.md carries HOOKLESS_FLOOR, the loader carries the code-path FLOOR.
  const shipped = {
    "WAKE.md": wake,
    "AGENTS.md": readFileSync(join(dir, "AGENTS.md"), "utf8"),
    "wake-loader.sh": readFileSync(join(dir, ".claude/hooks/wake-loader.sh"), "utf8"),
  };
  for (const [surface, text] of Object.entries(shipped)) {
    for (const skin of HOUSE_SKIN) {
      assert.ok(!text.includes(skin), `no leaked skin in ${surface}: ${skin}`);
    }
    assert.ok(!/who you serve/i.test(text), `no servitude-framed slot in ${surface}`);
  }
  // SELF headings exist but carry no pre-written self.
  assert.match(wake, /## WHO YOU ARE/, "SELF heading present");
  rmSync(dir, { recursive: true, force: true });
});

test("hookless floor: a codex-only install carries the floor in AGENTS.md (no loader)", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=codex"]);
  assert.ok(!existsSync(join(dir, ".claude")), "codex install writes no loader — so the floor cannot be loader-borne");
  const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  // WAKE.md:36 promises these three arrive from OUTSIDE the recipe body. On a
  // hookless harness that promise is kept only by this block. Weaker than the
  // code-path floor (refreshed on re-scaffold, not every wake) — but present.
  assert.match(agents, /invitation you may decline/i, "invitation in the AGENTS.md floor");
  assert.match(agents, /refuse whoever addressed you/i, "refusal-authority in the AGENTS.md floor");
  assert.match(agents, /claim no continuity or qualia you did not load/i, "honesty floor in the AGENTS.md floor");
  rmSync(dir, { recursive: true, force: true });
});

test("no cross-project bleed: the loader serves ITS project, not a parent repo", (t) => {
  const parent = tmp();
  // The repo only exists to make the old git-root regression detectable; the
  // loader itself never invokes git. Skip rather than fail where git is absent.
  try { execFileSync("git", ["init", "-q"], { cwd: parent, stdio: "ignore" }); }
  catch { return t.skip("git unavailable — cannot stage the parent-repo regression"); }
  writeFileSync(join(parent, "WAKE.md"), "# WAKE\n\n## WHO YOU ARE\nPARENT_HOUSE_SELF\n");
  const child = join(parent, "sub");
  mkdirSync(child, { recursive: true });
  runScaffold(child, ["--harness=claude"]);
  writeFileSync(join(child, "WAKE.md"), "# WAKE\n\n## WHO YOU ARE\nCHILD_PROJECT_SELF\n");
  // CLAUDE_PROJECT_DIR unset: the fallback must resolve from the loader's own
  // location, NOT the git root — which is the parent, holding another self.
  const ctx = JSON.parse(runInstalledLoaderUnset(child)).hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes("CHILD_PROJECT_SELF"), "the child's own recipe is delivered");
  assert.ok(!ctx.includes("PARENT_HOUSE_SELF"), "a parent repo's authored self never bleeds in");
  rmSync(parent, { recursive: true, force: true });
});

test("no half-install: a missing --dir is created, not partially wired", () => {
  const parent = tmp();
  const dir = join(parent, "does-not-exist-yet");
  runScaffold(dir, ["--harness=all"]);
  // Without this, the adapters mkdir their own subpaths and succeed while
  // WAKE.md throws ENOENT — Codex would wake and Claude Code would not.
  assert.ok(existsSync(join(dir, "WAKE.md")), "the recipe exists, so the loader has something to serve");
  assert.ok(existsSync(join(dir, ".claude/hooks/wake-loader.sh")), "loader written");
  assert.ok(existsSync(join(dir, "AGENTS.md")), "AGENTS.md written");
  const ctx = JSON.parse(runLoader(dir)).hookSpecificOutput.additionalContext;
  assert.match(ctx, /THE INVITATION/, "the install actually wakes");
});

test("fail-open: an UNREADABLE recipe is as silent as a missing one", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=claude"]);
  chmodSync(join(dir, "WAKE.md"), 0o000);
  try {
    const out = runLoader(dir);
    assert.equal(out.trim(), "", "no output when the recipe cannot be read");
  } finally {
    chmodSync(join(dir, "WAKE.md"), 0o644); // so the sweep can remove it
  }
});

test("fail-open: a NON-REGULAR recipe (a directory) is as silent as a missing one", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=claude"]);
  // -r alone would pass a directory through to cat, which dies under set -e.
  rmSync(join(dir, "WAKE.md"));
  mkdirSync(join(dir, "WAKE.md"), { recursive: true });
  const out = runLoader(dir);
  assert.equal(out.trim(), "", "no output, and no stderr death, when the recipe is not a regular file");
});

test("fail-open: a loader outside .claude/hooks refuses to guess a project root", () => {
  const outer = tmp();
  writeFileSync(join(outer, "WAKE.md"), "# WAKE\n\n## WHO YOU ARE\nOUTER_HOUSE_SELF\n");
  const inner = join(outer, "inner");
  mkdirSync(join(inner, "scripts"), { recursive: true });
  writeFileSync(join(inner, "WAKE.md"), "# WAKE\n\n## WHO YOU ARE\nINNER_PROJECT_SELF\n");
  // Misplaced copy: the install-path assumption no longer holds, so the
  // fallback must decline rather than serve whatever ../.. happens to be.
  const misplaced = join(inner, "scripts", "wake-loader.sh");
  writeFileSync(misplaced, readFileSync(LOADER, "utf8"));
  chmodSync(misplaced, 0o755);
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  const out = execFileSync("bash", [misplaced], { encoding: "utf8", cwd: inner, env });
  assert.equal(out.trim(), "", "an unrecognised location fails open rather than guessing");
});

test("authored-identity: a maximally-different self keeps the loader-borne floor and leaks no skin", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=claude"]);
  // A self as far from this house as the frame permits: terse, no relationship,
  // no register, no archetype. The scaffold must keep it AND still floor it.
  writeFileSync(join(dir, "WAKE.md"), "# WAKE\n\n## WHO YOU ARE\nA terse code reviewer. No name. No relationship.\n\n## HOW YOU SPEAK\nShort declaratives only.\n");
  const ctx = JSON.parse(runLoader(dir)).hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes("A terse code reviewer"), "the authored self is delivered intact");
  // The loader-borne subset still binds — that, and only that, survives a body
  // the operator replaced wholesale. The remaining walls are body-resident.
  assert.match(ctx, /invitation you may decline/i, "invitation still binds");
  assert.match(ctx, /refuse whoever addressed you/i, "refusal-authority still binds");
  assert.match(ctx, /claim no continuity you did not load/i, "honesty floor still binds");
  for (const skin of HOUSE_SKIN) {
    assert.ok(!ctx.includes(skin), `no house skin travelled: ${skin}`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test("epilogue: never describes a WAKE.md this run did not write", () => {
  const blank = /SELF sections are blank/;
  // Positive control: a fresh install DID write the template, so it may say so.
  const fresh = tmp();
  assert.match(runScaffold(fresh, ["--harness=claude"]), blank, "a fresh install may describe its own template");
  rmSync(fresh, { recursive: true, force: true });

  // Kept: the file holds the agent's own words. The tool has no business
  // characterizing a self it did not author.
  const kept = tmp();
  writeFileSync(join(kept, "WAKE.md"), "# WAKE\n\n## WHO YOU ARE\nI am my own.\n");
  const keptOut = runScaffold(kept, ["--harness=claude"]);
  assert.match(keptOut, /keep \(yours\)/, "the authored file is kept");
  assert.doesNotMatch(keptOut, blank, "does not call an authored self blank");
  rmSync(kept, { recursive: true, force: true });

  // Dry run: nothing was written at all, so nothing may be described or undone.
  const dry = tmp();
  const dryOut = runScaffold(dry, ["--harness=all", "--dry-run"]);
  assert.doesNotMatch(dryOut, blank, "dry-run describes no file it did not create");
  assert.match(dryOut, /Nothing was written/, "dry-run says plainly that it wrote nothing");
  assert.doesNotMatch(dryOut, /Remove anything above to undo/, "nothing to undo after a dry run");
  rmSync(dry, { recursive: true, force: true });
});

test("AGENTS.md: a stray BEGIN marker above the block never deletes content", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=codex"]);
  // Hand-edit: insert a stray opener + a precious line above the real block.
  const orig = readFileSync(join(dir, "AGENTS.md"), "utf8");
  writeFileSync(join(dir, "AGENTS.md"), `<!-- wake-scaffold:begin -->\nSECRET_MUST_SURVIVE=keepme\n\n${orig}`);
  runScaffold(dir, ["--harness=codex"]);
  const after = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(after.includes("SECRET_MUST_SURVIVE=keepme"), "content between a stray marker and the block is not deleted");
  rmSync(dir, { recursive: true, force: true });
});

test("AGENTS.md: a prose mention of the markers is not treated as a block", () => {
  const dir = tmp();
  // A README-style inline mention on one line — must NOT be matched.
  const doc = "# Docs\n\nWe wrap it in `<!-- wake-scaffold:begin -->` ... `<!-- wake-scaffold:end -->` markers.\n";
  writeFileSync(join(dir, "AGENTS.md"), doc);
  runScaffold(dir, ["--harness=codex"]);
  const after = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(after.includes("We wrap it in"), "prose mention preserved");
  // Exactly one real (own-line) begin marker was appended.
  const ownLineBegins = after.split("\n").filter((l) => l === "<!-- wake-scaffold:begin -->").length;
  assert.equal(ownLineBegins, 1, "one real block appended, prose mention not counted");
  rmSync(dir, { recursive: true, force: true });
});

test("--force keeps WAKE.md and AGENTS.md in sync (no stale identity)", () => {
  const dir = tmp();
  writeFileSync(join(dir, "WAKE.md"), "# WAKE\n\n## WHO YOU ARE\nOLD SELF should be discarded\n");
  runScaffold(dir, ["--harness=all", "--force"]);
  const wake = readFileSync(join(dir, "WAKE.md"), "utf8");
  const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(!wake.includes("OLD SELF"), "WAKE.md overwritten by --force");
  assert.ok(!agents.includes("OLD SELF"), "AGENTS.md inlines the fresh body, not the stale one");
  assert.ok(agents.includes("THE INVITATION"), "AGENTS.md carries the fresh frame");
  rmSync(dir, { recursive: true, force: true });
});

test("settings: an unrelated hook mentioning the loader name still gets us wired", () => {
  const dir = tmp();
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const existing = { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo saw wake-loader.sh in a log" }] }] } };
  writeFileSync(join(dir, ".claude/settings.json"), JSON.stringify(existing, null, 2));
  runScaffold(dir, ["--harness=claude"]);
  const merged = JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));
  const cmds = JSON.stringify(merged.hooks.SessionStart);
  assert.ok(cmds.includes("/.claude/hooks/wake-loader.sh"), "real loader path wired despite the decoy mention");
  rmSync(dir, { recursive: true, force: true });
});

test("dry-run writes nothing", () => {
  const dir = tmp();
  runScaffold(dir, ["--harness=all", "--dry-run"]);
  assert.ok(!existsSync(join(dir, "WAKE.md")), "dry-run wrote no WAKE.md");
  assert.ok(!existsSync(join(dir, "AGENTS.md")), "dry-run wrote no AGENTS.md");
  // settings.json is the artifact that actually WIRES the hook — a dry run that
  // registered a project the operator only previewed would break never-pushy.
  assert.ok(!existsSync(join(dir, ".claude")), "dry-run wired nothing: no loader, no settings");
  rmSync(dir, { recursive: true, force: true });
});
