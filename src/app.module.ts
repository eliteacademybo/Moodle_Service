import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { InscripcionModule } from './modules/inscripcion/inscripcion.module';
import { RolsModule } from './modules/rols/rols.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { MenusModule } from './modules/menus/menus.module';
import { ModuloModule } from './modules/modulo/modulo.module';
import { LeccionModule } from './modules/leccion/leccion.module';
import { RecursosLeccionModule } from './modules/recursos-leccion/recursos-leccion.module';
import { CursoModule } from './modules/curso/curso.module';
import { ProgresoLeccionModule } from './modules/progreso-leccion/progreso-leccion.module';
import { ProgresoModuloModule } from './modules/progreso-modulo/progreso-modulo.module';
import { ProgresoCursoModule } from './modules/progreso-curso/progreso-curso.module';
import { FormularioLeccionModule } from './modules/formulario-leccion/formulario-leccion.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';
import { CertificadosModule } from './modules/certificado/certificado.module';
import { ProgresoModule } from './modules/progreso/progreso.module';
import { CategoriaModule } from './modules/categoria/categoria.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { LeadModule } from './lead/lead.module';
import { DescuentoModule } from './modules/descuento/descuento.module';
import { VentasModule } from './ventas/ventas.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { ClientErrorsModule } from './client-errors/ClientErrorsModule ';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UserModule,
    PrismaModule,
    RolsModule,
    PermissionsModule, MenusModule,
    ModuloModule, LeccionModule, RecursosLeccionModule, CursoModule,
    InscripcionModule,
    ProgresoLeccionModule,
    ProgresoModuloModule,
    ProgresoCursoModule,
    FormularioLeccionModule,
    CertificadosModule,
    ProgresoModule,
    CategoriaModule,
    NotificacionesModule,
    LeadModule,
    DescuentoModule,
    VentasModule,
    GoogleDriveModule,
    ClientErrorsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    }
  ],
})
export class AppModule { }
