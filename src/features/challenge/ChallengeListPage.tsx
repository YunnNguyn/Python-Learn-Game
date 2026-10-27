import { useMemo } from "react";

import { useChallengeServices } from "../../app/services";
import { challengePresentation } from "../../content/challenges/presentations";
import { ChallengeNoticeBox, ChallengeListView, PRACTICE_NOT_EXAM_NOTE } from "./ChallengeViews";
import { describeReadError } from "./challenge-view-models";

/** `/challenge`: the challenge catalog. It is static content, so nothing here touches storage. */
export function ChallengeListPage() {
  const services = useChallengeServices();
  const listing = useMemo(() => services.listChallenges(), [services]);

  return (
    <section className="page-card learning-page practice-page challenge-page" aria-labelledby="challenge-title">
      <p className="eyebrow">Thử thách</p>
      <h1 id="challenge-title">Thử thách dữ liệu</h1>
      <p className="page-lead">
        Làm một bài dự đoán nhỏ theo kiểu Kaggle: tải dữ liệu, tạo tệp dự đoán, nộp lên để được chấm điểm ngay trong trình duyệt. Bài nộp được lưu riêng trên
        thiết bị này, không ảnh hưởng đến lộ trình học, phần Luyện tập hay phần thưởng của robot.
      </p>
      {listing.ok ? (
        <ChallengeListView state={{ challenges: listing.value }} presentationOf={challengePresentation} />
      ) : (
        <ChallengeNoticeBox notice={describeReadError(listing.error)} />
      )}
      <p className="practice-security-note">{PRACTICE_NOT_EXAM_NOTE}</p>
    </section>
  );
}
