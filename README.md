# Eblast Marketing Game

Mobile-first review game for the **Eblast Intelligence** Google Sheet.

## Features
- Inbox for reviewing marketing blasts
- Daily / weekly / monthly review goals
- Top 10 marketing leaderboard
- Filters for Destination, Activity, Traveler Type, and Deal Type
- Reid Rank, Tags, Notes, Marketing Angle, Score, and Status
- Direct link to the original email
- Google Sheets read/write via OAuth

## Google Sheet
Spreadsheet ID: `1Rme7fqbXIvzaSeuZAELVUf9ArWJEmApWSD7WHt-U4DE`
Tab: `Eblast Log`

## One-time setup
1. Enable Google Sheets API in Google Cloud.
2. Create an OAuth 2.0 Web application client.
3. Add the GitHub Pages origin as an Authorized JavaScript origin.
4. Put that client ID in `config.js`.
5. Enable GitHub Pages from the repository root on the main branch.

No Gmail data, OAuth access tokens, or client secrets should be committed to this repository.
