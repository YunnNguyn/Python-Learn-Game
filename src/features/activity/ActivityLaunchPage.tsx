import { Link, useParams } from "react-router-dom";

import { useApplicationServices } from "../../app/services";
import {
  LearningActivityType,
  type LearningActivityId,
} from "../../core/domain";

export function ActivityLaunchPage() {
  const { activityId } = useParams();
  const { content } = useApplicationServices();
  const activity = activityId
    ? content.getActivity(activityId as LearningActivityId)
    : undefined;

  if (activity === undefined) {
    return (
      <section className="page-card" aria-labelledby="activity-title">
        <p className="eyebrow">Hoạt động học</p>
        <h1 id="activity-title">Không tìm thấy hoạt động</h1>
        <Link className="primary-action primary-action--link" to="/learn">
          Về không gian học
        </Link>
      </section>
    );
  }

  const executable =
    activity.type === LearningActivityType.CODE_MISSION ||
    activity.type === LearningActivityType.DEBUG_MISSION ||
    activity.type === LearningActivityType.BOSS_MISSION;

  return (
    <section className="page-card" aria-labelledby="activity-title">
      <p className="eyebrow">Hoạt động học</p>
      <h1 id="activity-title">{activity.title}</h1>
      {activity.description ? <p className="page-lead">{activity.description}</p> : null}
      <div className="status-block">
        <p>
          Bài thực hành sẽ tạo dữ liệu theo seed cố định, khởi động Python trong
          Web Worker và chuẩn bị các package mà nhiệm vụ cần.
        </p>
        {executable ? (
          <Link className="primary-action primary-action--link" to={`/mission/${activity.id}`}>
            Bắt đầu thực hành
          </Link>
        ) : (
          <p>Loại hoạt động này chưa được nối vào workspace ở phiên bản hiện tại.</p>
        )}
      </div>
    </section>
  );
}
