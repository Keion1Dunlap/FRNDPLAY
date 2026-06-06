export default function AutoQueueControls({
  enabled,
  vibe,
  isAutoQueuing,
  onToggle,
  onChangeVibe,
}) {
  function handleToggle(e) {
    if (typeof onToggle !== "function") {
      console.error("AutoQueueControls is missing onToggle prop");
      return;
    }

    onToggle(e.target.checked);
  }

  function handleChangeVibe(e) {
    if (typeof onChangeVibe !== "function") {
      console.error("AutoQueueControls is missing onChangeVibe prop");
      return;
    }

    onChangeVibe(e.target.value);
  }

  return (
    <div className="auto-queue-controls">
      <label>
        <input
          type="checkbox"
          checked={Boolean(enabled)}
          onChange={handleToggle}
        />
        Auto Queue
      </label>

      {enabled && (
        <select value={vibe || "rap"} onChange={handleChangeVibe}>
          <option value="rap">Rap</option>
          <option value="r&b">R&B</option>
          <option value="club">Club</option>
          <option value="afrobeats">Afrobeats</option>
          <option value="throwbacks">Throwbacks</option>
          <option value="chill">Chill</option>
          <option value="clean party music">Clean Party</option>
          <option value="atlanta rap">Atlanta Rap</option>
          <option value="party hits">Party Hits</option>
        </select>
      )}

      {isAutoQueuing && (
        <p className="auto-queue-status">
          Auto Queue is adding songs...
        </p>
      )}
    </div>
  );
}