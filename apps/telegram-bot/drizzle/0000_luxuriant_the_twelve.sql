CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`multisig_address` text,
	`threshold` integer DEFAULT 2 NOT NULL,
	`order_seqno` integer DEFAULT 0 NOT NULL,
	`api_key` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`telegram_user_id` text NOT NULL,
	`telegram_username` text,
	`display_name` text,
	`public_key` text,
	`signer_index` integer,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`action` text NOT NULL,
	`amount` text,
	`recipient` text,
	`reason` text NOT NULL,
	`proposed_by` text NOT NULL,
	`order_seqno` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`votes_for` integer DEFAULT 0 NOT NULL,
	`votes_against` integer DEFAULT 0 NOT NULL,
	`threshold` integer NOT NULL,
	`message_id` text,
	`tx_hash` text,
	`expires_at` text,
	`executed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`telegram_user_id` text NOT NULL,
	`approve` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action
);
