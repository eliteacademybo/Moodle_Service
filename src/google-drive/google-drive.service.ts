import {
    BadRequestException,
    Injectable,
    Logger,
    OnModuleInit,
    ServiceUnavailableException,
} from '@nestjs/common';
import { drive_v3, google } from 'googleapis';
import { Readable } from 'stream';

@Injectable()
export class GoogleDriveService implements OnModuleInit {
    private readonly logger = new Logger(GoogleDriveService.name);
    private drive: drive_v3.Drive | null = null;

    constructor() {
        const {
            GOOGLE_DRIVE_CLIENT_ID,
            GOOGLE_DRIVE_CLIENT_SECRET,
            GOOGLE_DRIVE_REFRESH_TOKEN,
        } = process.env;

        if (
            !GOOGLE_DRIVE_CLIENT_ID ||
            !GOOGLE_DRIVE_CLIENT_SECRET ||
            !GOOGLE_DRIVE_REFRESH_TOKEN
        ) {
            this.logger.warn(
                'Faltan variables de Google Drive. El servicio iniciará deshabilitado.',
            );
            return;
        }

        const auth = new google.auth.OAuth2(
            GOOGLE_DRIVE_CLIENT_ID,
            GOOGLE_DRIVE_CLIENT_SECRET,
        );

        auth.setCredentials({
            refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN,
        });

        this.drive = google.drive({
            version: 'v3',
            auth,
        });
    }

    async onModuleInit() {
        if (!this.drive) {
            this.logger.warn(
                'Google Drive no está configurado. El backend continuará funcionando.',
            );
            return;
        }

        try {
            const { data } = await this.drive.about.get({
                fields: 'user(displayName,emailAddress)',
            });

            this.logger.log(
                `Google Drive conectado: ${data.user?.emailAddress ??
                data.user?.displayName ??
                'Cuenta desconocida'
                }`,
            );
        } catch (error) {
            this.logger.error(
                'No se pudo conectar con Google Drive. El backend continuará funcionando.',
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    private obtenerDrive(): drive_v3.Drive {
        if (!this.drive) {
            throw new ServiceUnavailableException(
                'Google Drive no está disponible temporalmente.',
            );
        }

        return this.drive;
    }

    async subirVideo(
        video: Express.Multer.File,
        folderId?: string,
    ): Promise<{
        id: string;
        name?: string | null;
        mimeType?: string | null;
        size?: string | null;
    }> {
        if (!video.mimetype.startsWith('video/')) {
            throw new BadRequestException(
                'El archivo enviado debe ser un video',
            );
        }

        const drive = this.obtenerDrive();

        const { data } = await drive.files.create({
            requestBody: {
                name: `${Date.now()}-${video.originalname}`,
                mimeType: video.mimetype,
                ...(folderId ? { parents: [folderId] } : {}),
            },
            media: {
                mimeType: video.mimetype,
                body: Readable.from(video.buffer),
            },
            fields: 'id,name,mimeType,size',
        });

        if (!data.id) {
            throw new Error(
                'Google Drive no devolvió el ID del archivo',
            );
        }

        return {
            id: data.id,
            name: data.name,
            mimeType: data.mimeType,
            size: data.size,
        };
    }

    async obtenerArchivo(fileId: string) {
        const drive = this.obtenerDrive();

        const { data } = await drive.files.get({
            fileId,
            fields: 'id,name,mimeType,size',
        });

        return data;
    }

    async obtenerVideo(fileId: string, range?: string) {
        const drive = this.obtenerDrive();

        const { data } = await drive.files.get(
            {
                fileId,
                alt: 'media',
            },
            {
                responseType: 'stream',
                ...(range
                    ? {
                        headers: {
                            Range: range,
                        },
                    }
                    : {}),
            },
        );

        return data;
    }

    extraerFileId(valor: string): string | null {
        if (!valor) {
            return null;
        }

        const limpio = valor.trim();

        const patrones = [
            /\/file\/d\/([^/?]+)/,
            /\/d\/([^/?]+)/,
            /[?&]id=([^&]+)/,
        ];

        for (const patron of patrones) {
            const match = limpio.match(patron);

            if (match?.[1]) {
                return match[1];
            }
        }

        if (
            !limpio.includes('/') &&
            !limpio.startsWith('http')
        ) {
            return limpio;
        }

        return null;
    }
}