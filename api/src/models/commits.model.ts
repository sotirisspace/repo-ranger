import { Entity, PrimaryGeneratedColumn, Column, BaseEntity, ManyToOne, Relation, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Username } from './username.model';

@Entity('commits')
export class Commit extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  username_id!: number;

  @Column({ type: 'varchar' })
  github_url!: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  github_sha!: string;

  @Column({ type: 'varchar' })
  message!: string;

  @ManyToOne(() => Username, (username: Username) => username.repos)
  username!: Relation<Username>;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP(6)' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)' })
  updated_at!: Date;
}
