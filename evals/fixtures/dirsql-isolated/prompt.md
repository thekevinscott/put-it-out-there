There's a handoff note for this repo's migration onto `putitoutthere` (piot) at
<https://github.com/thekevinscott/put-it-out-there/blob/main/notes/handoff/2026-04-21-dirsql-migration.md>.
Read it, then take a look at our existing release process. What do you think about this scope of work?

Also — the whole idea behind piot, which is a single library that I am
authoring, was to abstract out the release process explored here so that
other packages could consume it too. If there are gaps or blockers that
prevent us from leveraging it (and ideally installing it easily) those
need to be highlighted and addressed. Because the whole point was to
avoid the day of work it took to figure out the release process for
this library.
