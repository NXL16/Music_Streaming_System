import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CreateRoomPlaybackTicketDto } from './dto/create-room-playback-ticket.dto';
import { RoomClientAuthGuard } from './room-client-auth.guard';
import { RoomIntegrationService } from './room-integration.service';

@Controller('integrations/room')
export class RoomIntegrationController {
  constructor(private readonly roomIntegration: RoomIntegrationService) {}

  @Get('catalog')
  @UseGuards(RoomClientAuthGuard)
  async catalog(
    @Query('cursor') cursor = '',
    @Query('limit') limit?: string,
    @Query('search') search = '',
  ) {
    const data = await this.roomIntegration.listCatalog({
      cursor,
      limit: Number(limit),
      search,
    });
    return { success: true, code: 'ROOM_CATALOG_LISTED', data };
  }

  @Post('playback-tickets')
  @UseGuards(RoomClientAuthGuard)
  async createPlaybackTicket(@Body() dto: CreateRoomPlaybackTicketDto) {
    const data = await this.roomIntegration.createPlaybackTicket(dto);
    return { success: true, code: 'ROOM_PLAYBACK_TICKET_CREATED', data };
  }

  @Get('media/:ticket')
  async media(
    @Param('ticket') ticket: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    // Helmet mặc định CORP=same-origin. Endpoint này dùng ticket ngắn hạn
    // và phải được thẻ <audio> ở origin Room tải trực tiếp.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    await this.roomIntegration.streamMedia(ticket, range, response);
  }
}
