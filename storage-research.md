# Free storage candidate research

## Supabase
The official Supabase pricing page shows the Free plan at $0/month with 1 GB file storage, 5 GB uncached egress, 5 GB cached egress, and a 500 MB database. The page also states that free projects are paused after one week of inactivity and the free plan allows two active projects. Supabase exposes a managed Storage API and JavaScript client, making it straightforward to connect from a Render Node.js backend.

Source: https://supabase.com/pricing

## Oracle Cloud Object Storage
Oracle's official Always Free documentation states that Always Free resources are free for the life of the account in the home region. Search results for the same official documentation identify 20 GB of combined Standard, Infrequent Access, and Archive Object Storage and 50,000 Object Storage API requests per month as Always Free resources. Oracle provides an S3-compatible Object Storage API, but account setup, identity policies, namespaces, and API signing are more involved than Supabase. Availability is tied to the tenancy's home region.

Source: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## Initial direction
Supabase is the lower-complexity choice for Agent Garden, but its project pausing after inactivity is a material drawback for a Render app. Oracle is the stronger always-free capacity choice if the user accepts a more complex setup and has an Oracle account. Backblaze B2 remains a candidate to verify through official pricing documentation before final selection.

## Backblaze B2
Backblaze's official pricing page states that the first 10 GB of B2 storage is free, with free transactions and free egress up to three times monthly storage. Its official S3-Compatible API documentation confirms that existing S3-compatible applications can work with minimal code changes, supports presigned upload and download URLs, and does not support browser-based presigned POST uploads. This matches Agent Garden's current server-proxied upload route and existing AWS SDK dependency well.

Source: https://www.backblaze.com/cloud-storage/pricing
Source: https://www.backblaze.com/docs/cloud-storage-s3-compatible-api

## Selection
Backblaze B2 is the recommended replacement for R2. It preserves the current S3 client and presigned URL design, has an always-free 10 GB storage allowance, and avoids Supabase's free-project pausing. The application will only need an endpoint, bucket name, key ID, and application key, all stored as Render secrets.
