use junobuild_collections::constants::{
    ASSETS_COLLECTIONS_NO_USER_USAGE, DB_COLLECTIONS_NO_USER_USAGE,
};
use junobuild_collections::types::core::CollectionKey;

pub fn is_db_collection_no_usage(collection: &CollectionKey) -> bool {
    DB_COLLECTIONS_NO_USER_USAGE.contains(&collection.as_str())
}

pub fn is_storage_collection_no_usage(collection: &CollectionKey) -> bool {
    ASSETS_COLLECTIONS_NO_USER_USAGE.contains(&collection.as_str())
}
