# G0 harness promotion — 2026-07-25

## Promoted harnesses

The following gitignored `.bench/` harnesses were copied into tracked `scripts/stress/`; the originals remain in place:

- `stress-floors.mjs`
- `stress-realistic.mjs`
- `probe-no-floor-invariant.mjs`
- `probe-false-infeasibility.mjs`

All existing comments and CLI parsing were preserved. `probe-no-floor-invariant.mjs` now contains the three expected hashes as a deliberately re-baselineable snapshot of the current optimizer output. It prints one `PASS` or `FAIL` line per case and sets a non-zero exit code on any mismatch.

## Relative import changes

Each promoted harness uses these path changes for its additional directory depth:

- `../web/tl-core.js` → `../../web/tl-core.js`
- `../web/optimizer/...` → `../../web/optimizer/...`
- `../scripts/lib/load-web-projections.mjs` → `../lib/load-web-projections.mjs`
- worker URL `../scripts/node-optimizer-task-worker.mjs` → `../node-optimizer-task-worker.mjs`

## Clean-checkout verification

The managed environment exposes `D:\TL_Helper\.git` read-only. The requested direct command was attempted from `D:\TL_Helper`: 

```text
git worktree add C:\Users\thats\AppData\Local\Temp\tl-helper-g0-1785019475462 HEAD
```

It was blocked before checkout by the environment, not by a harness dependency:

```text
Preparing worktree (detached HEAD 031d91a)
fatal: could not create directory of '.git/worktrees/tl-helper-g0-1785019475462': Permission denied
```

To keep the verification isolated from all working-tree and untracked files while still using `git worktree add`, I made a temporary local clone with no checkout, then added a detached-HEAD worktree from that writable clone:

```text
git -c safe.directory=D:/TL_Helper/.git clone --no-hardlinks --no-checkout D:\TL_Helper C:\Users\thats\AppData\Local\Temp\tl-helper-g0-source-1785019513950
# cwd: C:\Users\thats\AppData\Local\Temp\tl-helper-g0-source-1785019513950
git worktree add C:\Users\thats\AppData\Local\Temp\tl-helper-g0-worktree-1785019513950 HEAD
```

The worktree reported `HEAD is now at 031d91a Optimizer: totalsOnly and clone removal in the hot evaluators`. I copied only the four new `scripts/stress/*.mjs` files into it. Before the runs, `git status --short` in that worktree reported only `?? scripts/stress/`.

From `C:\Users\thats\AppData\Local\Temp\tl-helper-g0-worktree-1785019513950`, I ran exactly:

```text
node scripts/stress/stress-floors.mjs --partition=1/4 --depth=fast
```

Exit code: `0`. Stderr was empty. Stdout:

```text
ok   sword/dagger  n=1 t=100% plain
ok?  sword/dagger  n=1 t=98% locked (infeasible, variant may forbid)
ok   sword/dagger  n=3 t=100% set
ok   sword/dagger  n=5 t=100% plain
ok?  sword/dagger  n=5 t=98% locked (infeasible, variant may forbid)
ok   sword/sword2h  n=1 t=100% set
ok   sword/sword2h  n=3 t=100% plain
ok?  sword/sword2h  n=3 t=98% locked (infeasible, variant may forbid)
ok?  sword/sword2h  n=5 t=100% set (infeasible, variant may forbid)
ok   staff/dagger  n=1 t=100% plain
ok?  staff/dagger  n=1 t=98% locked (infeasible, variant may forbid)
ok?  staff/dagger  n=3 t=100% set (infeasible, variant may forbid)
ok   staff/dagger  n=5 t=100% plain
ok?  staff/dagger  n=5 t=98% locked (infeasible, variant may forbid)
ok   crossbow/dagger  n=1 t=100% set
ok   crossbow/dagger  n=3 t=100% plain
ok?  crossbow/dagger  n=3 t=98% locked (infeasible, variant may forbid)
ok   crossbow/dagger  n=5 t=100% set
ok   gauntlet/sword2h  n=1 t=100% plain
ok?  gauntlet/sword2h  n=1 t=98% locked (infeasible, variant may forbid)
ok?  gauntlet/sword2h  n=3 t=100% set (infeasible, variant may forbid)
ok   gauntlet/sword2h  n=5 t=100% plain
ok?  gauntlet/sword2h  n=5 t=98% locked (infeasible, variant may forbid)
ok   bow/dagger  n=1 t=100% set
ok   bow/dagger  n=3 t=100% plain
ok?  bow/dagger  n=3 t=98% locked (infeasible, variant may forbid)
ok   bow/dagger  n=5 t=100% set
ok   orb/wand  n=1 t=100% plain
ok?  orb/wand  n=1 t=98% locked (infeasible, variant may forbid)
ok   orb/wand  n=3 t=100% set
ok   orb/wand  n=5 t=100% plain
ok?  orb/wand  n=5 t=98% locked (infeasible, variant may forbid)
ok   sword/wand  n=1 t=100% set
ok   sword/wand  n=3 t=100% plain
ok?  sword/wand  n=3 t=98% locked (infeasible, variant may forbid)
ok   sword/wand  n=5 t=100% set

PARTITION 1/4  cases=36  pass=36  fail=0
```

Then I ran exactly:

```text
node scripts/stress/probe-no-floor-invariant.mjs
```

Exit code: `0`. Stderr was empty. Stdout:

```text
PASS sword/dagger: 596c8913e38d0a3e96910d6691a5b39035bb5be75b980c7834a435f80e3884b6
PASS staff/dagger: e2021bdd8c5405f0410b17c3e15b581445f581dde79b8153a041500a9903e962
PASS crossbow/dagger: 5a2dc21bb9886702cbf3a73a64d68da676110d76faab21daeaa2c3ad9748dd13
{
  "label": "run",
  "results": [
    {
      "weapons": "sword/dagger",
      "attributes": {
        "str": 0,
        "dex": 0,
        "int": 0,
        "per": 55,
        "con": 4
      },
      "score": 6.831504513,
      "hash": "596c8913e38d0a3e96910d6691a5b39035bb5be75b980c7834a435f80e3884b6"
    },
    {
      "weapons": "staff/dagger",
      "attributes": {
        "str": 13,
        "dex": 20,
        "int": 11,
        "per": 10,
        "con": 5
      },
      "score": 0.444922438,
      "hash": "e2021bdd8c5405f0410b17c3e15b581445f581dde79b8153a041500a9903e962"
    },
    {
      "weapons": "crossbow/dagger",
      "attributes": {
        "str": 9,
        "dex": 12,
        "int": 5,
        "per": 24,
        "con": 9
      },
      "score": 2.525841316,
      "hash": "5a2dc21bb9886702cbf3a73a64d68da676110d76faab21daeaa2c3ad9748dd13"
    }
  ]
}
```

## Dependency finding

No untracked runtime dependency was found. The detached-HEAD worktree contained only committed repository content plus the four copied promoted harnesses, and both required commands completed successfully. The direct source-repository worktree creation restriction above is a managed-filesystem limitation on `.git/worktrees`, not a harness dependency.

## Cleanup

After capturing the results, the temporary verification worktree was removed with:

```text
# cwd: C:\Users\thats\AppData\Local\Temp\tl-helper-g0-source-1785019513950
git worktree remove --force C:\Users\thats\AppData\Local\Temp\tl-helper-g0-worktree-1785019513950
```
