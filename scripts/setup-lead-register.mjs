import { setupLeadSheets } from '../netlify/functions/lib/lead-management.mjs'

try {
  const result = await setupLeadSheets()
  console.log(`Lead register ready. Tabs: ${result.leadTab}, ${result.controlTab}.`)
  console.log('Status, quote status and outcome dropdowns were installed. Owner dropdowns are added only when owner option variables are configured.')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Lead register setup failed.')
  process.exitCode = 1
}
