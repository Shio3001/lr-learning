type ButtonProps = {
  handler?: () => void;
  text: string;
};

const Button = (props: ButtonProps) => {
  return (
    <button
      onClick={(e) => {
        props.handler?.();
      }}
      className="my-button"
    >
      {props.text}
    </button>
  );
};

export default Button;
