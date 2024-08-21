Current bugs:

See test position 8 in AnalyzeView.vue
- seems to be fixed after doing the web worker, b/c transposition table gets reset
- but could still secretly be an issue

When reaching depth 8-10 from the starting position, depending on if doing search extensions, we reach maximum call stack size.
How is that possible?

See try...catch in findBestMoves v18