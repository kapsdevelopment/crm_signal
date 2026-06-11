create unique index generated_signals_change_event_type_unique
  on generated_signals (change_event_id, signal_type)
  where change_event_id is not null;
