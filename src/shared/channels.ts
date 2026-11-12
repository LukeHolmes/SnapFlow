// IPC channel names. Kept in one place so main + preload never drift.
export const CH = {
  captureListSources: 'capture:listSources',
  captureScreen:      'capture:screen',
  captureScroll:      'capture:scroll',
  captureScrollPreview:'capture:scrollPreview',
  captureScrollSave:  'capture:scrollSave',
  captureSaveAnnotated:'capture:saveAnnotated',
  captureSaveFocusBlur:'capture:saveFocusBlur',
  captureSaveRedacted:'capture:saveRedacted',
  capturePiiScan:       'capture:piiScan',
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
  integrationsDisconnect:'integrations:disconnect',
  integrationsZapierTest:'integrations:zapierTest',
  guidesList:         'guides:list',
  guidesCreate:       'guides:create',
  guidesGet:          'guides:get',
  guidesUpdate:       'guides:update',
  guidesExportMarkdown:'guides:exportMarkdown',
  entitlementsGet:    'entitlements:get',
  accountGet:         'account:get',
  authSessionGet:     'auth:sessionGet',
  authLoginStart:     'auth:loginStart',
  authSignOut:        'auth:signOut',
  authChanged:        'auth:changed',
  aiTaggingPrefGet:   'prefs:aiTaggingGet',
  aiTaggingPrefSet:   'prefs:aiTaggingSet',
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
  integrationConnected:'integration:connected', // main -> dashboard: OAuth deep-link success
  integrationError:   'integration:error',      // main -> dashboard: OAuth deep-link failure
  openWindowPicker:   'window:openPicker',  // main -> dashboard: open the window picker (⌘⇧5)
  // Screen colour picker (eyedropper)
  colourStart:        'colour:start',
  colourPickerFrame:  'colour:pickerFrame',
  colourPickerSample: 'colour:pickerSample',
  colourPickerPick:   'colour:pickerPick',
  colourPickerCancel: 'colour:pickerCancel',
  colourPicked:       'colour:picked',      // main -> dashboard: colour copied
  colourRecentList:   'colour:recentList',
  colourFormatGet:    'colour:formatGet',
  colourFormatSet:    'colour:formatSet',
  syncNow:            'sync:now',
  syncPrefGet:        'sync:prefGet',
  syncPrefSet:        'sync:prefSet',
  evidenceSyncPrefGet: 'evidence:syncPrefGet',
  evidenceSyncPrefSet: 'evidence:syncPrefSet',
  evidenceLinkCapture: 'evidence:linkCapture',
  evidenceBuildPack:   'evidence:buildPack',
  evidenceSignPack:    'evidence:signPack',
  evidenceExportPack:  'evidence:exportPack',
  evidenceSyncNow:     'evidence:syncNow',
  diffCompute:        'diff:compute',    // before+after capture IDs → pixel diff result + path
  diffSummarise:      'diff:summarise',  // before+after IDs → AI plain-English summary (Pro/Team)
  diffGetImage:       'diff:getImage',   // diff PNG path → data URL
  diffSave:           'diff:save',       // diff path + source IDs → history row tagged diff
  diffFindPrevious:   'diff:findPrevious', // captureId → previous same-window capture id
  captureGetImage:    'capture:getImage',// capture ID → base64 data URL for rendering in the renderer
  teamMe:             'team:me',
  teamCreate:         'team:create',
  teamInvite:         'team:invite',
  teamLeave:          'team:leave',
  teamShareCapture:   'team:shareCapture',
  captureGetMedia:    'capture:getMedia',// recording → file path for playback
  recordingStart:     'recording:start',
  recordingStop:      'recording:stop',
  recordingPause:     'recording:pause',
  recordingResume:    'recording:resume',
  recordingStatusGet: 'recording:status',
  recordingExportGif: 'recording:exportGif',
  openRecordingPicker:'window:openRecordingPicker',
  openRecordWindowPicker:'window:openRecordWindowPicker',
  appGetMeta:           'app:getMeta',
  appOpenLegal:         'app:openLegal',
  openAbout:            'window:openAbout',
  recordingStatus:    'recording:statusPush',
  recWorkerStart:     'recording:workerStart',
  recWorkerChunk:     'recording:workerChunk',
  recWorkerDone:      'recording:workerDone',
  recWorkerError:     'recording:workerError',
  recControlStop:     'recording:controlStop',
  recControlPause:    'recording:controlPause',
  recControlResume:   'recording:controlResume',
} as const;
export type Channel = (typeof CH)[keyof typeof CH];
