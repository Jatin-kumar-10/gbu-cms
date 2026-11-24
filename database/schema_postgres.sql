-- GBU-CMS schema — PostgreSQL variant (functionally identical to database/schema.sql).
-- Use this file instead of schema.sql if you prefer Postgres over MySQL.
-- Run as: psql -U youruser -d gbu_cms -f database/schema_postgres.sql

CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'user'
                        CHECK (role IN ('user','officer','technician','store','admin')),
    department_id   INT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE departments (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(100) NOT NULL UNIQUE
);

ALTER TABLE users
    ADD CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

CREATE TABLE buildings (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(120) NOT NULL
);

CREATE TABLE rooms (
    id              SERIAL PRIMARY KEY,
    building_id     INT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    name            VARCHAR(80) NOT NULL
);

CREATE TABLE complaints (
    id              SERIAL PRIMARY KEY,
    complaint_code  VARCHAR(20) NOT NULL UNIQUE,
    user_id         INT NOT NULL REFERENCES users(id),
    room_id         INT NOT NULL REFERENCES rooms(id),
    department_id   INT NOT NULL REFERENCES departments(id),
    category        VARCHAR(100) NOT NULL,
    description     TEXT NOT NULL,
    photo_path      VARCHAR(255) NULL,
    priority        VARCHAR(10) NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High')),
    status          VARCHAR(30) NOT NULL DEFAULT 'Submitted' CHECK (status IN (
                        'Submitted','Verified','Invalid','WorkOrderCreated',
                        'InProgress','CompletedByTechnician','Inspected',
                        'Rejected','Closed','Reopened'
                    )),
    invalid_reason  VARCHAR(255) NULL,
    sla_target_hours INT NOT NULL DEFAULT 72,
    reopen_count    INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at     TIMESTAMP NULL,
    closed_at       TIMESTAMP NULL
);

CREATE TABLE work_orders (
    id              SERIAL PRIMARY KEY,
    wo_code         VARCHAR(20) NOT NULL UNIQUE,
    complaint_id    INT NOT NULL REFERENCES complaints(id),
    technician_id   INT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'Assigned' CHECK (status IN (
                        'Assigned','Started','InProgress','Completed',
                        'Inspected','Rejected','Closed'
                    )),
    before_photo_path VARCHAR(255) NULL,
    after_photo_path  VARCHAR(255) NULL,
    inspection_note   VARCHAR(255) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP NULL
);

CREATE TABLE inventory_items (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(120) NOT NULL,
    unit                VARCHAR(20) NOT NULL DEFAULT 'pcs',
    quantity_on_hand    DECIMAL(10,2) NOT NULL DEFAULT 0,
    low_stock_threshold DECIMAL(10,2) NOT NULL DEFAULT 5
);

CREATE TABLE material_issues (
    id              SERIAL PRIMARY KEY,
    work_order_id   INT NOT NULL REFERENCES work_orders(id),
    item_id         INT NOT NULL REFERENCES inventory_items(id),
    quantity_requested DECIMAL(10,2) NOT NULL DEFAULT 0,
    quantity_issued DECIMAL(10,2) NOT NULL DEFAULT 0,
    quantity_consumed DECIMAL(10,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested','Issued','Consumed')),
    requested_by    INT NOT NULL REFERENCES users(id),
    issued_by       INT NULL REFERENCES users(id),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_at       TIMESTAMP NULL
);

CREATE TABLE feedback (
    id              SERIAL PRIMARY KEY,
    complaint_id    INT NOT NULL REFERENCES complaints(id),
    rating          SMALLINT NOT NULL,
    comment         VARCHAR(500) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id),
    message     VARCHAR(255) NOT NULL,
    link        VARCHAR(255) NULL,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
    id          SERIAL PRIMARY KEY,
    user_id     INT NULL,
    action      VARCHAR(100) NOT NULL,
    entity      VARCHAR(50) NOT NULL,
    entity_id   INT NULL,
    details     VARCHAR(500) NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed data (identical to schema.sql)
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

-- Password for ALL seeded accounts is:  Password@123
INSERT INTO users (name, email, password_hash, role, department_id) VALUES
 ('System Admin',        'admin@gbu.ac.in',      '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'admin', NULL),
 ('Civil Officer',       'officer.civil@gbu.ac.in','$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'officer', 1),
 ('Electrical Officer',  'officer.elec@gbu.ac.in', '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'officer', 2),
 ('Ramesh (Civil Tech)', 'tech.ramesh@gbu.ac.in', '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'technician', 1),
 ('Suresh (Elec Tech)',  'tech.suresh@gbu.ac.in', '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'technician', 2),
 ('Store Officer',       'store@gbu.ac.in',       '$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'store', NULL),
 ('Aditi (Student)',     'student.aditi@gbu.ac.in','$2y$10$ANK3wkZOM3/foYqRl7H7wuGgVGvPAsrX5TO2IrWiKFn.zQiT6M8oy', 'user', NULL);
