import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMetaProgression } from "../../app/services";
import {
  InventoryItemId,
  RobotId,
  STARTER_ROBOT_BLUEPRINT,
  canAfford,
  inventoryItemLabel,
  type InventoryBalances,
  type RewardGrant,
  type RobotPartId,
} from "../../core/meta-progression";

export function RobotWorkshopPage() {
  const { metaProgression, snapshot } = useMetaProgression();
  const [message, setMessage] = useState<string | null>(null);
  const [busyPartId, setBusyPartId] = useState<RobotPartId | null>(null);
  const [assembling, setAssembling] = useState(false);

  const builtPartIds = useMemo(
    () => new Set(snapshot.builtRobotPartIds),
    [snapshot.builtRobotPartIds],
  );
  const assembled = snapshot.assembledRobotIds.includes(RobotId.STARTER_SCOUT);
  const allPartsBuilt = STARTER_ROBOT_BLUEPRINT.parts.every((part) =>
    builtPartIds.has(part.id),
  );

  async function handleBuild(partId: RobotPartId) {
    setBusyPartId(partId);
    setMessage(null);
    try {
      const result = await metaProgression.buildRobotPart(partId);
      setMessage(
        result.ok
          ? "Đã chế tạo bộ phận và trừ vật liệu khỏi kho."
          : result.message,
      );
    } finally {
      setBusyPartId(null);
    }
  }

  async function handleAssemble() {
    setAssembling(true);
    setMessage(null);
    try {
      const result = await metaProgression.assembleStarterRobot();
      setMessage(
        result.ok
          ? "Scout-01 đã được lắp ráp hoàn chỉnh."
          : result.message,
      );
    } finally {
      setAssembling(false);
    }
  }

  return (
    <section className="page-card workshop-page" aria-labelledby="workshop-title">
      <div className="workshop-heading-row">
        <div>
          <p className="eyebrow">Meta progression</p>
          <h1 id="workshop-title">Xưởng robot</h1>
        </div>
        <Link className="secondary-action" to="/learn">
          Về lộ trình học
        </Link>
      </div>
      <p className="page-lead">
        Học và làm bài để nhận vật liệu. Vật liệu chỉ dùng cho hệ thống phụ này;
        chúng không ảnh hưởng điểm, mastery hay chấm bài.
      </p>

      <section className="workshop-section" aria-labelledby="inventory-title">
        <div className="workshop-section__heading">
          <div>
            <p className="learning-card__meta">Kho vật liệu</p>
            <h2 id="inventory-title">Tài nguyên hiện có</h2>
          </div>
        </div>
        <InventorySummary inventory={snapshot.inventory} />
      </section>

      <section className="workshop-section" aria-labelledby="daily-goals-title">
        <div className="workshop-section__heading">
          <div>
            <p className="learning-card__meta">KPI hôm nay</p>
            <h2 id="daily-goals-title">
              {snapshot.dailyGoalsCompleted}/{snapshot.dailyGoalsTotal} mục tiêu
            </h2>
          </div>
          <span
            className={`progress-pill ${snapshot.dailyBonusClaimed ? "progress-pill--complete" : ""}`}
          >
            {snapshot.dailyBonusClaimed ? "Đã nhận bonus" : "Chưa nhận bonus"}
          </span>
        </div>
        <div className="daily-goal-list">
          {snapshot.dailyGoals.map((goal) => (
            <article
              className={`daily-goal-item ${goal.completed ? "daily-goal-item--complete" : ""}`}
              key={goal.id}
            >
              <div>
                <strong>{goal.title}</strong>
                <p>{goal.description}</p>
              </div>
              <span>
                {goal.current}/{goal.target}
              </span>
            </article>
          ))}
        </div>
        <p className="workshop-note">
          Hoàn thành cả ba mục tiêu sẽ tự nhận 6 tấm kim loại, 3 bo mạch và 1 pin năng lượng.
          Bonus mỗi ngày chỉ nhận một lần.
        </p>
      </section>

      <section className="workshop-section" aria-labelledby="robot-title">
        <div className="workshop-robot-header">
          <div>
            <p className="learning-card__meta">Dự án hiện tại</p>
            <h2 id="robot-title">{STARTER_ROBOT_BLUEPRINT.name}</h2>
            <p>{STARTER_ROBOT_BLUEPRINT.description}</p>
          </div>
          <div
            className={`robot-preview ${assembled ? "robot-preview--complete" : ""}`}
            aria-label={assembled ? "Scout-01 đã hoàn thành" : "Scout-01 đang lắp ráp"}
          >
            <span aria-hidden="true">🤖</span>
            <strong>
              {assembled
                ? "HOÀN THÀNH"
                : `${builtPartIds.size}/${STARTER_ROBOT_BLUEPRINT.parts.length} BỘ PHẬN`}
            </strong>
          </div>
        </div>

        <div className="robot-parts-grid">
          {STARTER_ROBOT_BLUEPRINT.parts.map((part) => {
            const built = builtPartIds.has(part.id);
            const affordable = canAfford(snapshot.inventory, part.cost);
            return (
              <article
                className={`robot-part-card ${built ? "robot-part-card--built" : ""}`}
                key={part.id}
              >
                <div className="robot-part-card__heading">
                  <h3>{part.name}</h3>
                  <span>{built ? "Đã chế tạo" : "Chưa có"}</span>
                </div>
                <p>{part.description}</p>
                <CostLine cost={part.cost} />
                <button
                  className="secondary-action secondary-action--button robot-part-card__button"
                  type="button"
                  disabled={built || !affordable || busyPartId !== null || assembled}
                  onClick={() => void handleBuild(part.id)}
                >
                  {built
                    ? "Đã lắp"
                    : busyPartId === part.id
                      ? "Đang chế tạo..."
                      : affordable
                        ? "Chế tạo"
                        : "Thiếu vật liệu"}
                </button>
              </article>
            );
          })}
        </div>

        <div className="robot-assembly-action">
          <div>
            <strong>Lắp ráp cuối</strong>
            <p>
              {assembled
                ? "Scout-01 đã sẵn sàng trong bộ sưu tập của bạn."
                : allPartsBuilt
                  ? "Đủ bộ phận. Bạn có thể hoàn thiện Scout-01."
                  : "Cần chế tạo đủ sáu bộ phận trước."}
            </p>
          </div>
          <button
            className="primary-action"
            type="button"
            disabled={!allPartsBuilt || assembled || assembling}
            onClick={() => void handleAssemble()}
          >
            {assembled ? "Đã hoàn thành" : assembling ? "Đang lắp ráp..." : "Lắp ráp Scout-01"}
          </button>
        </div>
        {message ? (
          <p className="workshop-message" aria-live="polite">
            {message}
          </p>
        ) : null}
      </section>

      <section className="workshop-section" aria-labelledby="reward-history-title">
        <div>
          <p className="learning-card__meta">Lịch sử gần đây</p>
          <h2 id="reward-history-title">Phần thưởng</h2>
        </div>
        {snapshot.recentRewards.length > 0 ? (
          <div className="reward-history-list">
            {snapshot.recentRewards.map((grant) => (
              <RewardHistoryItem grant={grant} key={grant.id} />
            ))}
          </div>
        ) : (
          <p className="workshop-note">
            Chưa có phần thưởng. Một lần đạt bài đầu tiên sẽ bắt đầu cấp vật liệu.
          </p>
        )}
      </section>
    </section>
  );
}

function InventorySummary({ inventory }: { readonly inventory: InventoryBalances }) {
  return (
    <div className="inventory-grid">
      {Object.values(InventoryItemId).map((itemId) => (
        <article className="inventory-card" key={itemId}>
          <span>{inventoryItemLabel(itemId)}</span>
          <strong>{inventory[itemId]}</strong>
        </article>
      ))}
    </div>
  );
}

function CostLine({ cost }: { readonly cost: InventoryBalances }) {
  const entries = Object.values(InventoryItemId).filter((itemId) => cost[itemId] > 0);
  return (
    <p className="robot-part-cost">
      {entries.map((itemId) => `${cost[itemId]} ${inventoryItemLabel(itemId)}`).join(" · ")}
    </p>
  );
}

function RewardHistoryItem({ grant }: { readonly grant: RewardGrant }) {
  const items = Object.values(InventoryItemId)
    .filter((itemId) => grant.items[itemId] > 0)
    .map((itemId) => `+${grant.items[itemId]} ${inventoryItemLabel(itemId)}`)
    .join(" · ");

  return (
    <article className="reward-history-item">
      <div>
        <strong>{rewardReasonLabel(grant.reason)}</strong>
        <span>{formatRewardTime(grant.awardedAt)}</span>
      </div>
      <p>{items}</p>
    </article>
  );
}

function rewardReasonLabel(reason: RewardGrant["reason"]): string {
  switch (reason) {
    case "FIRST_ACTIVITY_PASS":
      return "Đạt hoạt động lần đầu";
    case "FOCUSED_ACTIVITY_PASS":
      return "Bonus tự làm";
    case "DAILY_FIRST_PASS":
      return "Lần đạt đầu ngày";
    case "DAILY_GOALS_COMPLETE":
      return "Hoàn thành KPI ngày";
  }
}

function formatRewardTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
