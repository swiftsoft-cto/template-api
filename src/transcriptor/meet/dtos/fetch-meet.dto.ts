import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
} from 'class-validator';

export class FetchMeetDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  @Matches(
    /^https:\/\/(meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}|workspace\.google\.com\/products\/meet)(\?.*)?$/i,
    {
      message:
        'url deve ser meet.google.com/xxx-xxxx-xxx ou workspace.google.com/products/meet',
    },
  )
  url!: string;

  /** Seletor CSS ou XPath (quando começa com //) do botão a clicar */
  @IsOptional()
  @IsString()
  clickSelector?: string;

  /** Se false, abre o browser em janela visível para acompanhar em tela. Default: true (headless). */
  @IsOptional()
  @IsBoolean()
  headless?: boolean;

  /** Se true, não fecha o browser/aba ao finalizar. Permite continuar acompanhando. */
  @IsOptional()
  @IsBoolean()
  keepOpen?: boolean;
}
