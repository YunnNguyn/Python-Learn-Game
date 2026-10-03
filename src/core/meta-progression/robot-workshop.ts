import {
  InventoryItemId,
  RobotId,
  RobotPartId,
  type InventoryBalances,
  type RobotPartId as RobotPartIdValue,
} from "./meta-types";

export interface RobotPartBlueprint {
  readonly id: RobotPartIdValue;
  readonly name: string;
  readonly description: string;
  readonly cost: InventoryBalances;
}

export interface RobotBlueprint {
  readonly id: RobotId;
  readonly name: string;
  readonly description: string;
  readonly parts: readonly RobotPartBlueprint[];
}

const cost = (
  metalPlate: number,
  circuitBoard: number,
  energyCell: number,
): InventoryBalances => ({
  [InventoryItemId.METAL_PLATE]: metalPlate,
  [InventoryItemId.CIRCUIT_BOARD]: circuitBoard,
  [InventoryItemId.ENERGY_CELL]: energyCell,
});

export const STARTER_ROBOT_BLUEPRINT: RobotBlueprint = {
  id: RobotId.STARTER_SCOUT,
  name: "Scout-01",
  description:
    "Robot trinh sát đầu tiên. Hoàn thành bài học để kiếm vật liệu, chế tạo đủ sáu bộ phận rồi lắp ráp.",
  parts: [
    {
      id: RobotPartId.CHASSIS,
      name: "Khung thân",
      description: "Bộ khung chịu lực của robot.",
      cost: cost(8, 0, 0),
    },
    {
      id: RobotPartId.DRIVE,
      name: "Cụm di chuyển",
      description: "Động cơ và bộ truyền động cơ bản.",
      cost: cost(6, 2, 0),
    },
    {
      id: RobotPartId.SENSOR,
      name: "Cụm cảm biến",
      description: "Mắt và cảm biến môi trường.",
      cost: cost(4, 4, 0),
    },
    {
      id: RobotPartId.POWER,
      name: "Nguồn năng lượng",
      description: "Bộ cấp nguồn cho toàn hệ thống.",
      cost: cost(3, 0, 1),
    },
    {
      id: RobotPartId.ARM,
      name: "Tay thao tác",
      description: "Cánh tay nhỏ dùng để nhặt và kiểm tra vật thể.",
      cost: cost(5, 2, 0),
    },
    {
      id: RobotPartId.AI_CORE,
      name: "AI Core",
      description: "Khối điều khiển trung tâm của Scout-01.",
      cost: cost(0, 6, 1),
    },
  ],
};

export function getStarterRobotPart(
  partId: RobotPartIdValue,
): RobotPartBlueprint | undefined {
  return STARTER_ROBOT_BLUEPRINT.parts.find((part) => part.id === partId);
}

export function canAfford(
  inventory: InventoryBalances,
  required: InventoryBalances,
): boolean {
  return (
    inventory.metal_plate >= required.metal_plate &&
    inventory.circuit_board >= required.circuit_board &&
    inventory.energy_cell >= required.energy_cell
  );
}
