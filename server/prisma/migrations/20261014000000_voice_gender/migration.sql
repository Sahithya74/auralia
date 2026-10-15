-- Anbu's voice for spoken replies; female unless she chooses otherwise.
ALTER TABLE `UserPreferences` ADD COLUMN `voiceGender` ENUM('FEMALE', 'MALE') NOT NULL DEFAULT 'FEMALE';
