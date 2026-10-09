import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import {
    OAuth2Client,
    type LoginTicket,
    type TokenPayload,
} from "google-auth-library";

import { UserService } from "../modules/user/user.service";
import { MenusService } from "src/modules/menus/menus.service";
import { PrismaService } from "src/prisma/prisma.service";

import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

import { AccessControlService } from "src/modules/permissions/access-control.service";
import { paises } from "./utils/paises";

type UsuarioAuth = NonNullable<
    Awaited<ReturnType<UserService["buscarPorCorreo"]>>
>;

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly menusService: MenusService,
        private readonly prisma: PrismaService,
        private readonly accessControlService: AccessControlService,
    ) { }

    async login(loginDto: LoginDto) {
        const correo = loginDto.correo.trim().toLowerCase();

        const usuario =
            await this.userService.buscarPorCorreo(correo);

        if (
            !usuario ||
            (usuario.estado !== "activo" &&
                usuario.estado !== "pendiente")
        ) {
            throw new UnauthorizedException(
                "Credenciales incorrectas",
            );
        }

        if (!usuario.contrasenaHash) {
            throw new UnauthorizedException(
                "Esta cuenta utiliza inicio de sesión con Google",
            );
        }

        const passwordValido = await bcrypt.compare(
            loginDto.password,
            usuario.contrasenaHash,
        );

        if (!passwordValido) {
            throw new UnauthorizedException(
                "Credenciales incorrectas",
            );
        }

        return this.generarRespuestaAuth(usuario);
    }

    async register(dto: RegisterDto) {
        const correo = dto.correo.trim().toLowerCase();

        const existente = await this.prisma.usuario.findUnique({
            where: { correo },
        });

        if (existente) {
            throw new ConflictException(
                'Ya existe una cuenta con este correo',
            );
        }

        const paisCodigo = dto.paisCodigo.trim().toUpperCase();
        const pais = paises[paisCodigo];

        if (!pais) {
            throw new BadRequestException(
                'El código del país no es válido',
            );
        }

        const contrasenaHash = await bcrypt.hash(dto.contrasena, 12);
        const username = await this.generarUsername(correo);

        await this.prisma.$transaction(async tx => {
            const usuario = await tx.usuario.create({
                data: {
                    username,
                    correo,
                    contrasenaHash,
                    estado: 'activo',
                    perfil: {
                        create: {
                            nombre: dto.nombre.trim(),
                            apellidoPaterno: dto.apellidoPaterno?.trim(),
                            apellidoMaterno: dto.apellidoMaterno?.trim(),
                            paisCodigo,
                            pais,
                        },
                    },
                },
            });

            await this.accessControlService.asignarRolEstudiante(
                usuario.id,
                tx,
            );
        });

        const usuarioCreado = await this.userService.buscarPorCorreo(correo);

        if (!usuarioCreado) {
            throw new InternalServerErrorException(
                'No se pudo recuperar el usuario registrado',
            );
        }

        return this.generarRespuestaAuth(usuarioCreado);
    }

    async google(credential: string) {
        const googleClientId =
            process.env.GOOGLE_CLIENT_ID;

        if (!googleClientId) {
            throw new InternalServerErrorException(
                "GOOGLE_CLIENT_ID no está configurado",
            );
        }

        const googleClient =
            new OAuth2Client(
                googleClientId,
            );

        let ticket: LoginTicket;

        try {
            ticket =
                await googleClient.verifyIdToken({
                    idToken: credential,
                    audience:
                        googleClientId,
                });
        } catch {
            throw new UnauthorizedException(
                "Credencial de Google inválida",
            );
        }

        const payload:
            | TokenPayload
            | undefined =
            ticket.getPayload();

        if (!payload) {
            throw new UnauthorizedException(
                "No se pudo obtener la información de Google",
            );
        }

        const email = payload.email;

        if (!email) {
            throw new UnauthorizedException(
                "Google no proporcionó un correo electrónico",
            );
        }

        if (
            payload.email_verified !== true
        ) {
            throw new UnauthorizedException(
                "El correo de Google no está verificado",
            );
        }

        const correo = email.trim().toLowerCase();

        const usuarioExistente =
            await this.userService.buscarPorCorreo(
                correo,
            );

        if (usuarioExistente) {
            if (
                usuarioExistente.estado !==
                "activo" &&
                usuarioExistente.estado !==
                "pendiente"
            ) {
                throw new UnauthorizedException(
                    "La cuenta no se encuentra activa",
                );
            }

            await this.prisma.usuario.update({
                where: {
                    id:
                        usuarioExistente.id,
                },
                data: {
                    correoVerificadoEn:
                        usuarioExistente.correoVerificadoEn ??
                        new Date(),
                    ultimoAccesoEn:
                        new Date(),
                },
            });

            const usuarioActualizado =
                await this.userService.buscarPorCorreo(
                    correo,
                );

            if (!usuarioActualizado) {
                throw new UnauthorizedException(
                    "Usuario no encontrado",
                );
            }

            return this.generarRespuestaAuth(
                usuarioActualizado,
            );
        }
        const username = await this.generarUsername(correo);

        await this.prisma.$transaction(async tx => {
            const usuario = await tx.usuario.create({
                data: {
                    username,
                    correo,
                    contrasenaHash: null,
                    estado: 'activo',
                    correoVerificadoEn: new Date(),
                    ultimoAccesoEn: new Date(),
                    perfil: {
                        create: {
                            nombre: payload.given_name ?? payload.name ?? 'Usuario',
                            apellidoPaterno: payload.family_name ?? null,
                            fotografiaRuta: payload.picture ?? null,
                            paisCodigo: null,
                        },
                    },
                },
            });

            await this.accessControlService.asignarRolEstudiante(usuario.id, tx);
        });

        const nuevoUsuario = await this.userService.buscarPorCorreo(correo);

        if (!nuevoUsuario) {
            throw new InternalServerErrorException(
                'No se pudo recuperar el usuario creado con Google',
            );
        }

        return this.generarRespuestaAuth(nuevoUsuario);
    }

    logout() {
        return {
            success: true,
            message:
                "Sesión cerrada correctamente",
        };
    }

    async changePassword(
        userId: string,
        newPassword: string,
    ) {
        const passwordHash =
            await bcrypt.hash(
                newPassword,
                12,
            );

        await this.userService.actualizarPassword(
            userId,
            passwordHash,
        );

        return {
            success: true,
            message:
                "Contraseña cambiada correctamente",
        };
    }

    async getProfile(
        userId: string,
    ) {
        const usuario =
            await this.userService.buscarPorId(
                userId,
            );

        if (!usuario) {
            throw new UnauthorizedException(
                "Usuario no encontrado",
            );
        }

        return {
            id: usuario.id,
            username:
                usuario.username,
            correo:
                usuario.correo,
            estado:
                usuario.estado,
            perfil:
                usuario.perfil,
        };
    }

    private async generarRespuestaAuth(
        usuario: UsuarioAuth,
    ) {
        const nombresRoles = usuario.roles.map(
            (item) => item.rol.nombre,
        );

        const permisos = usuario.roles.flatMap(
            (item) =>
                item.rol.permisos.map(
                    (rolPermiso) =>
                        rolPermiso.permiso.nombre,
                ),
        );

        const rolIds = usuario.roles.map(
            (item) => item.rolId,
        );

        const menus =
            await this.menusService.obtenerMenusPorRoles(
                rolIds,
            );

        const requiereCompletarPerfil =
            !usuario.perfil?.nombre ||
            !usuario.perfil?.telefono ||
            !usuario.perfil?.paisCodigo;

        const payload = {
            sub: usuario.id,
            username: usuario.username,
        };

        const access_token =
            await this.jwtService.signAsync(
                payload,
                {
                    expiresIn: "1h",
                },
            );

        return {
            access_token,
            usuario: {
                id: usuario.id,
                username: usuario.username,
                correo: usuario.correo,
                estado: usuario.estado,
                rol: nombresRoles,
                permisos,
                menus,
                requiereCompletarPerfil,
                paisCodigo: usuario.perfil?.paisCodigo ?? null,
            },
        };
    }
    private async generarUsername(
        correo: string,
    ) {
        let base =
            correo
                .split("@")[0]
                .toLowerCase()
                .replace(
                    /[^a-z0-9._-]/g,
                    "",
                );

        if (!base) {
            base =
                "usuario";
        }

        const existente =
            await this.prisma.usuario.findUnique({
                where: {
                    username:
                        base,
                },
            });

        if (!existente) {
            return base;
        }

        while (true) {
            const sufijo =
                Math.random()
                    .toString(36)
                    .slice(2, 8);

            const username =
                `${base}_${sufijo}`;

            const usernameExistente =
                await this.prisma.usuario.findUnique({
                    where: {
                        username,
                    },
                });

            if (!usernameExistente) {
                return username;
            }
        }
    }
}