// =============================================
// framer.ts - 로컬 프리뷰용 Framer shim
//
// 프레이머 에디터 밖에서 컴포넌트를 테스트할 때 사용합니다.
// 프레이머 에디터에 복사할 때는 이 파일이 필요 없습니다.
// (프레이머는 "framer" 패키지를 자체 제공)
// =============================================

export const ControlType = {
    String: "string",
    Number: "number",
    Boolean: "boolean",
    Enum: "enum",
    Color: "color",
    Image: "image",
    File: "file",
    Array: "array",
    Object: "object",
    ComponentInstance: "componentinstance",
    FusedNumber: "fusednumber",
    Transition: "transition",
    EventHandler: "eventhandler",
    Link: "link",
    ResponsiveImage: "responsiveimage",
} as const

export function addPropertyControls(_component: any, _controls: any) {
    // 로컬 프리뷰에서는 아무 동작 안 함
    // 프레이머 에디터에서만 속성 패널이 표시됨
}
