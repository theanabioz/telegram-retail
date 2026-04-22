# Startup Performance Note

## Status

After the auth/cache hardening and migration toward real Telegram-only authentication, the mini app still opens slightly slower than the earlier baseline.

Current subjective behavior:

- startup is already noticeably better than the worst 1-2 second state
- but it is still not as near-instant as the earlier "feels already open" behavior

## What We Already Adjusted

- restored compatibility with older startup cache entries
- allowed fresh startup cache reuse across token refreshes

## Suspected Causes To Revisit Later

- extra auth handshake before rendering the live shell
- stricter startup bootstrap sequence around `/auth/me` and `/auth/telegram`
- cached startup restoration still not early enough in the boot path

## Follow-up Goal

Revisit cold-start UX later and optimize for:

- immediate shell paint from cache
- background auth refresh
- minimal visible loading before first interactive frame
