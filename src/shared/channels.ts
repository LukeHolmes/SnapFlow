// IPC channel names. Kept in one place so main + preload never drift.
export const CH = {
  captureListSources: 'capture:listSources',
  captureScreen:      'capture:screen',
  captureScroll:      'capture:scroll',
  captureScrollPreview:'capture:scrollPreview',
  captureScrollSave:  'capture:scrollSave',
  captureSaveAnnotated:'capture:saveAnnotated',
  captureSaveRedacted:'capture:saveRedacted',
  captureAnnotationsGet:'capture:annotations:get',
  captureAnnotationsSave:'capture:annotations:save',
  captureCopyImage:   'capture:copyImage',
  captureCopyOcr:     'capture:copyOcr',
  capturePin:         'capture:pin',
  historyList:        'history:list',
  historySearch:      'history:search',
  historyDelete:      'history:delete',
  presetsList:        'presets:list',
  presetsAdd:         'presets:add',
  presetsUpsert:      'presets:upsert',
  presetsRemove:      'presets:remove',
  presetsSend:        'presets:send',
  integrationsStatuses:'integrations:statuses',
  integrationsConnect:'integrations:connect',
  integrationsSlackChannels:'integrations:slackChannels',
  integrationsNotionPages:'integrations:notionPages',
  integrationsGmailProfile:'integrations:gmailProfile',
  integrationsGithubRepos:'integrations:githubRepos',
  integrationsZapierTest:'integrations:zapierTest',
  guidesList:         'guides:list',
  guidesCreate:       'guides:create',
  guidesGet:          'guides:get',
  guidesUpdate:       'guides:update',
  guidesExportMarkdown:'guides:exportMarkdown',
  entitlementsGet:    'entitlements:get',
  statsGet:           'stats:get',
  eventsRecent:       'events:recent',
  // Region-select overlay
  regionStart:        'region:start',     // dashboard -> main: open the selector
  overlayFrame:       'overlay:frame',     // overlay  -> main: fetch the frozen frame
  overlayUpdate:      'overlay:update',    // overlay  -> main: latest selection rect
  overlayConfirm:     'overlay:confirm',   // overlay  -> main: selection rect (CSS px)
  overlayCancel:      'overlay:cancel',    // overlay  -> main: aborted
  captureAdded:       'capture:added',     // main -> dashboard: a capture finished, refresh
  captureError:       'capture:error',      // main -> dashboard: capture failed outside direct IPC
  openWindowPicker:   'window:openPicker',  // main -> dashboard: open the window picker (⌘⇧5)
  syncNow:            'sync:now',
  diffCompute:        'diff:compute',    // before+after capture IDs → pixel diff result + path
  diffSummarise:      'diff:summarise',  // before+after IDs → AI plain-English summary (Pro/Team)
  captureGetImage:    'capture:getImage',// capture ID → base64 data URL for rendering in the renderer           // dashboard -> main: run a sync cycle now
} as const;
export type Channel = (typeof CH)[keyof typeof CH];
