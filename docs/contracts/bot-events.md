# Bot Events Contract

## Inbound
- `/start`
- `questionnaire.answer`
- `free_chat.message`
- `catalog.page`
- `recommendation.accept`
- `recommendation.reject`
- `memory.delete_request`

## Outbound
- `reply.text`
- `reply.cards`
- `reply.followup_buttons`
- `reply.warning`
- `reply.safe_refusal`

## Mandatory metadata
- `user_id`
- `thread_id`
- `message_id`
- `route`
- `risk_level`
- `provider_used`
- `cache_hit`
