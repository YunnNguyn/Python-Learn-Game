import { Link } from "react-router-dom";

import {
  InventoryItemId,
  inventoryItemLabel,
  type RewardGrant,
} from "../../core/meta-progression";

export interface MissionRewardPanelProps {
  readonly grants: readonly RewardGrant[];
}

export function MissionRewardPanel({ grants }: MissionRewardPanelProps) {
  if (grants.length === 0) return null;

  const totals = grants.reduce(
    (sum, grant) => ({
      metal_plate: sum.metal_plate + grant.items.metal_plate,
      circuit_board: sum.circuit_board + grant.items.circuit_board,
      energy_cell: sum.energy_cell + grant.items.energy_cell,
    }),
    { metal_plate: 0, circuit_board: 0, energy_cell: 0 },
  );

  return (
    <section className="mission-reward-panel" aria-labelledby="mission-reward-title">
      <div>
        <p className="learning-card__meta">Phần thưởng</p>
        <h2 id="mission-reward-title">Đã thêm vật liệu vào kho</h2>
        <div className="mission-reward-items">
          {Object.values(InventoryItemId)
            .filter((itemId) => totals[itemId] > 0)
            .map((itemId) => (
              <span key={itemId}>
                +{totals[itemId]} {inventoryItemLabel(itemId)}
              </span>
            ))}
        </div>
      </div>
      <Link className="secondary-action" to="/workshop">
        Mở xưởng robot
      </Link>
    </section>
  );
}
