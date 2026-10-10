import { Module } from '@nestjs/common';
import { MapController } from './map.controller';
import { MapTilesService } from './map-tiles.service';

@Module({
  controllers: [MapController],
  providers: [MapTilesService],
})
export class MapModule {}
