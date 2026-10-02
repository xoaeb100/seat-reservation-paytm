import { Entity, PrimaryColumn } from 'typeorm';

@Entity('user_show_locks')
export class UserShowLock {
  @PrimaryColumn({ type: 'uuid' })
  showId!: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  userId!: string;
}