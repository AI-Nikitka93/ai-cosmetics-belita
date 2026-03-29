# Recommendation Schema

## Envelope
- `recommendation_id`
- `thread_id`
- `mode`: `questionnaire | free_chat`
- `disclaimer_required`
- `summary_for_user`
- `products[]`

## Product item
- `product_id`
- `name`
- `line`
- `category`
- `routine_slot`
- `fit_score`
- `risk_score`
- `confidence_score`
- `why_it_fits[]`
- `key_ingredients[]`
- `watch_out[]`
- `usage_hint`
- `source_urls[]`
