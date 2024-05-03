pub mod state {
    use candid::{CandidType, Deserialize};
    use junobuild_shared::types::cronjob::CronJobs;
    use junobuild_shared::types::state::{ArchiveTime, Controllers, MissionControlId, SegmentsStatuses, Timestamp, UserId, Version};
    use std::collections::HashMap;

    pub type CronTabs = HashMap<UserId, CronTab>;

    #[derive(Default, Clone)]
    pub struct State {
        pub stable: StableState,
    }

    #[derive(Default, CandidType, Deserialize, Clone)]
    pub struct StableState {
        pub controllers: Controllers,
        pub cron_tabs: CronTabs,
        pub archive: Archive,
    }

    #[derive(CandidType, Deserialize, Clone)]
    pub struct CronTab {
        pub mission_control_id: MissionControlId,
        pub cron_jobs: CronJobs,
        pub created_at: Timestamp,
        pub updated_at: Timestamp,
        pub version: Option<Version>,
    }

    #[derive(Default, CandidType, Deserialize, Clone)]
    pub struct Archive {
        pub statuses: HashMap<UserId, ArchiveStatuses>,
    }

    #[derive(CandidType, Deserialize, Clone)]
    pub struct ArchiveStatuses {
        pub timestamp: ArchiveTime,
        pub statuses: Result<SegmentsStatuses, String>,
    }
}

pub mod interface {
    use candid::{CandidType, Deserialize};
    use junobuild_shared::types::cronjob::CronJobs;
    use junobuild_shared::types::state::{ArchiveTime, MissionControlId, SegmentsStatuses, Version};

    #[derive(Default, CandidType, Deserialize, Clone)]
    pub struct ListStatusesArgs {
        pub time_delta: Option<u64>,
    }

    #[derive(CandidType, Deserialize)]
    pub struct ListStatuses {
        pub cron_jobs: CronJobs,
        pub timestamp: ArchiveTime,
        pub statuses: Result<SegmentsStatuses, String>,
    }

    #[derive(CandidType, Deserialize)]
    pub struct SetCronTab {
        pub mission_control_id: MissionControlId,
        pub cron_jobs: CronJobs,
        pub version: Option<Version>,
    }
}
