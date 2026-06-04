// IPC channel names. Kept in one place so main + preload never drift.
export const CH = {
  captureListSources: 'capture:listSources',
  captureScreen:      'capture:screen',
  historyList:        'history:list',
  historySearch:      'history:search',
  historyDelete:      'history:delete',
  presetsList:        'presets:list',
  presetsAdd:         'presets:add',
  presetsRemove:      'presets:remove',
  presetsSend:        'presets:send',
  entitlementsGet:    'entitlements:get',
  statsGet:           'stats:get',
  eventsRecent:       'events:recent',
  // Region-select overlay
  regionStart:        'region:start',     // dashboard -> main: open the selector
  overlayFrame:       'overlay:frame',     // overlay  -> main: fetch the frozen frame
  overlayConfirm:     'overlay:confirm',   // overlay  -> main: selection rect (CSS px)
  overlayCancel:      'overlay:cancel',    // overlay  -> main: aborted
  captureAdded:       'capture:added',     // main -> dashboard: a capture finished, refresh
  openWindowPicker:   'window:openPicker',  // main -> dashboard: open the window picker (⌘⇧5)
  syncNow:            'sync:now',
  diffCompute:        'diff:compute',    // before+after capture IDs → pixel diff result + path
  diffSummarise:      'diff:summarise',  // before+after IDs → AI plain-English summary (Pro/Team)
  captureGetImage:    'capture:getImage',// capture ID → base64 data URL for rendering in the renderer           // dashboard -> main: run a sync cycle now
} as const;
export type Channel = (typeof CH)[keyof typeof CH];
