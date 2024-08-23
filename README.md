Current bugs:

See test position 8 in AnalyzeView.vue
- seems to be fixed after doing the web worker, b/c transposition table gets reset (also am resetting the transposition table in findBestMoves anyways)
- but could still secretly be an issue

See try...catch in findBestMoves v18 - gets triggered very rarely when playing long competitions and causes an error

Sometimes when playing the mmai, my program will find a "forced win" but after another move decides it wasn't actually forced
or was forced but in more moves