-- GBU-CMS (Gautam Buddha University Centralized Campus Maintenance Management System)
-- Minor-project MVP schema, derived from GBU-CMS Simplified SRS v0.1
-- Target: MySQL 5.7+ / MariaDB 10.3+ (also works on MySQL 8)

CREATE DATABASE IF NOT EXISTS gbu_cms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gbu_cms;

-- ---------------------------------------------------------------------
-- 1. USER
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('user','officer','technician','store','admin') NOT NULL DEFAULT 'user',
    department_id   INT NULL,            -- relevant for officer/technician
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. DEPARTMENT
-- ---------------------------------------------------------------------
CREATE TABLE departments (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(100) NOT NULL UNIQUE   -- Civil / Electrical / Horticulture
) ENGINE=InnoDB;

ALTER TABLE users
    ADD CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 3. BUILDING / 4. ROOM  (2-level location hierarchy)
-- ---------------------------------------------------------------------
CREATE TABLE buildings (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(120) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE rooms (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    building_id     INT NOT NULL,
    name            VARCHAR(80) NOT NULL,     -- room/number or facility name
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. COMPLAINT
-- ---------------------------------------------------------------------
CREATE TABLE complaints (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    complaint_code  VARCHAR(20) NOT NULL UNIQUE,     -- e.g. CMP-2026-000123
    user_id         INT NOT NULL,
    room_id         INT NOT NULL,
    department_id   INT NOT NULL,
    category        VARCHAR(100) NOT NULL,
    description     TEXT NOT NULL,
    photo_path      VARCHAR(255) NULL,
    priority        ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
    status          ENUM(
                        'Submitted','Verified','Invalid','WorkOrderCreated',
                        'InProgress','CompletedByTechnician','Inspected',
                        'Rejected','Closed','Reopened'
                    ) NOT NULL DEFAULT 'Submitted',
    invalid_reason  VARCHAR(255) NULL,
    sla_target_hours INT NOT NULL DEFAULT 72,
    reopen_count    INT NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at     DATETIME NULL,
    closed_at       DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. WORK_ORDER
-- ---------------------------------------------------------------------
CREATE TABLE work_orders (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    wo_code         VARCHAR(20) NOT NULL UNIQUE,     -- e.g. WO-2026-000045
    complaint_id    INT NOT NULL,
    technician_id   INT NULL,
    status          ENUM(
                        'Assigned','Started','InProgress','Completed',
                        'Inspected','Rejected','Closed'
                    ) NOT NULL DEFAULT 'Assigned',
    before_photo_path VARCHAR(255) NULL,
    after_photo_path  VARCHAR(255) NULL,
    inspection_note   VARCHAR(255) NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME NULL,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id),
    FOREIGN KEY (technician_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. INVENTORY_ITEM
-- ---------------------------------------------------------------------
CREATE TABLE inventory_items (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(120) NOT NULL,
    unit                VARCHAR(20) NOT NULL DEFAULT 'pcs',
    quantity_on_hand    DECIMAL(10,2) NOT NULL DEFAULT 0,
    low_stock_threshold DECIMAL(10,2) NOT NULL DEFAULT 5
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. MATERIAL_ISSUE  (request + issue + consumption combined, no return/reconciliation per scope)
-- ---------------------------------------------------------------------
CREATE TABLE material_issues (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    work_order_id   INT NOT NULL,
    item_id         INT NOT NULL,
    quantity_requested DECIMAL(10,2) NOT NULL DEFAULT 0,
    quantity_issued DECIMAL(10,2) NOT NULL DEFAULT 0,
    quantity_consumed DECIMAL(10,2) NOT NULL DEFAULT 0,
    status          ENUM('Requested','Issued','Consumed') NOT NULL DEFAULT 'Requested',
    requested_by    INT NOT NULL,
    issued_by       INT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_at       DATETIME NULL,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
    FOREIGN KEY (item_id) REFERENCES inventory_items(id),
    FOREIGN KEY (requested_by) REFERENCES users(id),
    FOREIGN KEY (issued_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. FEEDBACK
-- ---------------------------------------------------------------------
CREATE TABLE feedback (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id    INT NOT NULL,
    rating          TINYINT NOT NULL,   -- 1-5
    comment         VARCHAR(500) NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Notifications (in-app only, FR-19)
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    message     VARCHAR(255) NOT NULL,
    link        VARCHAR(255) NULL,
    is_read     TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. AUDIT_LOG  (FR-21)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NULL,
    action      VARCHAR(100) NOT NULL,
    entity      VARCHAR(50) NOT NULL,
    entity_id   INT NULL,
    details     VARCHAR(500) NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =======================================================================
-- Seed data
-- =======================================================================

INSERT INTO departments (name) VALUES ('Civil'), ('Electrical'), ('Horticulture');

INSERT INTO buildings (name) VALUES ('Hostel Block A'), ('Academic Block 1'), ('Library');

INSERT INTO rooms (building_id, name) VALUES
 (1, 'Room 101'), (1, 'Room 102'), (1, 'Common Washroom'),
 (2, 'Lecture Hall 1'), (2, 'Faculty Room 3'),
 (3, 'Reading Hall');

INSERT INTO inventory_items (name, unit, quantity_on_hand, low_stock_threshold) VALUES
 ('PVC Pipe (1 inch)', 'meter', 50, 10),
 ('LED Bulb 9W', 'pcs', 100, 20),
 ('Electrical Wire (1.5 sq mm)', 'meter', 200, 30),
 ('Cement Bag', 'bag', 20, 5),
 ('Garden Shears', 'pcs', 8, 2);

-- Default users. Password for ALL seeded accounts is:  Password@123
INSERT INTO users (name, email, password_hash, role, department_id) VALUES
 ('System Admin',        'admin@gbu.ac.in',      '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'admin', NULL),
 ('Civil Officer',       'officer.civil@gbu.ac.in','$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'officer', 1),
 ('Electrical Officer',  'officer.elec@gbu.ac.in', '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'officer', 2),
 ('Ramesh (Civil Tech)', 'tech.ramesh@gbu.ac.in', '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'technician', 1),
 ('Suresh (Elec Tech)',  'tech.suresh@gbu.ac.in', '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'technician', 2),
 ('Store Officer',       'store@gbu.ac.in',       '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'store', NULL),
 ('Aditi (Student)',     'student.aditi@gbu.ac.in','$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'user', NULL);
