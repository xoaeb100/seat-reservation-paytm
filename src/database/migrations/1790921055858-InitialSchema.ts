import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1790921055858 implements MigrationInterface {
    name = 'InitialSchema1790921055858'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."reservations_status_enum" AS ENUM('confirmed', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "reservations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "showId" uuid NOT NULL, "userId" character varying(255) NOT NULL, "idempotencyKey" character varying(255) NOT NULL, "requestHash" character varying(64) NOT NULL, "amountPaise" integer NOT NULL, "status" "public"."reservations_status_enum" NOT NULL DEFAULT 'confirmed', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cancelledAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_da95cef71b617ac35dc5bcda243" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1aa5bed743c33cc224f20a241d" ON "reservations"  ("showId", "userId", "idempotencyKey") `);
        await queryRunner.query(`CREATE TABLE "reservation_seats" ("reservationId" uuid NOT NULL, "seatId" uuid NOT NULL, CONSTRAINT "PK_e942941e1b1ff9bbc1a4c02d5d8" PRIMARY KEY ("reservationId", "seatId"))`);
        await queryRunner.query(`CREATE TYPE "public"."seats_status_enum" AS ENUM('available', 'held', 'confirmed', 'na')`);
        await queryRunner.query(`CREATE TABLE "seats" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "showId" uuid NOT NULL, "seatNumber" character varying(50) NOT NULL, "status" "public"."seats_status_enum" NOT NULL DEFAULT 'available', CONSTRAINT "PK_3fbc74bb4638600c506dcb777a7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1b80fc4ab3afde55590f6d2242" ON "seats"  ("showId", "seatNumber") `);
        await queryRunner.query(`CREATE TABLE "shows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "priceInPaise" integer NOT NULL, "perUserLimit" integer NOT NULL DEFAULT '4', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_db2b12161dbc5081c4f50025669" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_show_locks" ("showId" uuid NOT NULL, "userId" character varying(255) NOT NULL, CONSTRAINT "PK_e6c1997843fed83af1facb413a7" PRIMARY KEY ("showId", "userId"))`);
        await queryRunner.query(`ALTER TABLE "reservations" ADD CONSTRAINT "FK_ce4f1075b9e52f36790df6cbe1f" FOREIGN KEY ("showId") REFERENCES "shows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reservation_seats" ADD CONSTRAINT "FK_e147dea59deb12e5ab5069db857" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reservation_seats" ADD CONSTRAINT "FK_d6ea4f24beed8e9ae8e00773acc" FOREIGN KEY ("seatId") REFERENCES "seats"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "seats" ADD CONSTRAINT "FK_68a66d42c5c3ccdf66624a77195" FOREIGN KEY ("showId") REFERENCES "shows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "seats" DROP CONSTRAINT "FK_68a66d42c5c3ccdf66624a77195"`);
        await queryRunner.query(`ALTER TABLE "reservation_seats" DROP CONSTRAINT "FK_d6ea4f24beed8e9ae8e00773acc"`);
        await queryRunner.query(`ALTER TABLE "reservation_seats" DROP CONSTRAINT "FK_e147dea59deb12e5ab5069db857"`);
        await queryRunner.query(`ALTER TABLE "reservations" DROP CONSTRAINT "FK_ce4f1075b9e52f36790df6cbe1f"`);
        await queryRunner.query(`DROP TABLE "user_show_locks"`);
        await queryRunner.query(`DROP TABLE "shows"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1b80fc4ab3afde55590f6d2242"`);
        await queryRunner.query(`DROP TABLE "seats"`);
        await queryRunner.query(`DROP TYPE "public"."seats_status_enum"`);
        await queryRunner.query(`DROP TABLE "reservation_seats"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1aa5bed743c33cc224f20a241d"`);
        await queryRunner.query(`DROP TABLE "reservations"`);
        await queryRunner.query(`DROP TYPE "public"."reservations_status_enum"`);
    }

}
